// SpamController — 200ms spam cadence across wallets with same-nonce replacements
// wallet အများကို 200ms cadence နဲ့ spam၊ nonce တူ replacement၊ spend-cap + maxRetry ထိန်း

const { reserveOnce, ensureGasLimit, broadcast, FALLBACK_GAS_LIMIT } = require("./retryQueue")
const { computeFees, maxGasCost } = require("./gasController")
const { classifyError, applyRecovery } = require("./failRecovery")
const { rankWallets } = require("./retryScorer")
const { RETRY_CLASS } = require("../config/constants")
const config = require("../config/settings")
const logger = require("../logger/logger")

const SPAM_INTERVAL_MS = 200 // open-phase spam cadence / ဖွင့်ပြီးတဲ့ spam cadence
const DRAIN_MS = 1000        // grace for in-flight settle / in-flight ပြီးအောင် စောင့်

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// has our tx for this wallet's nonce been mined? / wallet nonce mine ဖြစ်ပြီးလား
async function checkConfirmation(rpc, walletState) {
	const provider = rpc.getProvider()
	try {
		const count = await rpc.call(provider, "getTransactionCount", walletState.address, "latest")
		if (count <= walletState.nonce) return { settled: false } // nonce not consumed yet / မ consume သေး
		// nonce consumed -> find which of our hashes landed / hash တွေထဲ ဘယ်ဟာ mine
		for (let i = walletState.hashes.length - 1; i >= 0; i--) {
			try {
				const receipt = await rpc.call(provider, "getTransactionReceipt", walletState.hashes[i])
				if (receipt) return { settled: true, success: receipt.status === 1, hash: walletState.hashes[i] }
			} catch (_) {}
		}
		// nonce consumed by an external/replaced tx (not ours) / တခြား tx က consume
		return { settled: true, success: false, external: true }
	} catch (e) {
		logger.debug(`[retry] confirm check failed ${walletState.label}: ${e && e.message}`)
		return { settled: false }
	}
}

// one send/replace attempt for a wallet / wallet တခုအတွက် attempt တခု
async function attemptOnce(rpc, walletState, ctx, report, budget) {
	walletState.sending = true
	try {
		await reserveOnce(walletState)                 // nonce ONCE / nonce တကြိမ်
		await ensureGasLimit(walletState, ctx)
		const fees = await computeFees(walletState.fees) // replacement bump vs previous / bump

		// spend-cap: project the marginal cost of THIS attempt / attempt cost ခန့်
		const attemptCost = maxGasCost(fees, walletState.gasLimit) + ctx.value
		const prevCost = walletState.reservedCost || 0n
		const delta = attemptCost > prevCost ? attemptCost - prevCost : 0n
		if (!budget.fits(delta)) {                     // cap guard BEFORE send / send မလုပ်ခင် cap စစ်
			budget.spendCapHit = true
			walletState.sending = false
			return
		}
		budget.commit(delta)
		walletState.reservedCost = attemptCost
		walletState.fees = fees
		walletState.attempts++
		report.recordAttempt(walletState, fees)

		const res = await broadcast(walletState, ctx, fees)
		if (res && res.hash) walletState.hashes.push(res.hash)
		walletState.lastError = null
	} catch (err) {
		walletState.lastError = err
		const cls = classifyError(err)
		if (cls.action === "mined") {
			// replacement already mined -> let the sweep finalize / sweep က finalize
		} else if (cls.class === RETRY_CLASS.FATAL) {
			walletState.status = "dropped"
			report.recordWallet(walletState)
			logger.warn(`[retry] ${walletState.label} fatal: ${cls.reason}`)
		} else {
			applyRecovery(cls.action, walletState)
			if (cls.action === "resync") {
				// maybe it actually landed before the nonce error / land ပြီးသားလား စစ်
				const conf = await checkConfirmation(rpc, walletState)
				if (conf.settled && conf.success) { walletState._mined = conf.hash }
			} else if (cls.action === "failover") {
				// exponential backoff for RPC errors only / RPC error မှ backoff
				const base = config.retry.backoffMs || 100
				const max = config.retry.backoffMaxMs || 2000
				walletState.backoffMs = Math.min((walletState.backoffMs || base) * 2, max)
				walletState.backoffUntil = Date.now() + walletState.backoffMs + Math.floor(Math.random() * (config.retry.jitterMs || 0))
			}
		}
	} finally {
		walletState.sending = false
		if (walletState.status === "sending") walletState.status = "pending"
	}
}

// run the open-phase spam loop until a terminal condition / terminal အထိ spam
async function runSpam(rpc, ctx, keystore, control, report) {
	report.markOpen()

	// provisional gas ceiling for readiness/ranking / ranking အတွက် gas ceiling ခန့်
	let provFees
	try { provFees = await computeFees(null) } catch (_) { provFees = { type: 2, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n } }
	const gasCeiling = maxGasCost(provFees, FALLBACK_GAS_LIMIT)

	const ranked = await rankWallets(keystore.getAll(), ctx, gasCeiling)
	const states = ranked.map((r) => ({
		wallet: r.wallet, address: r.address,
		nonce: null, gasLimit: null, fees: null,
		hashes: [], attempts: 0, sending: false,
		status: "pending", reservedCost: 0n, lastError: null,
		backoffMs: 0, backoffUntil: 0, _mined: null,
	}))

	const cap = config.retry.spendCapWei || 0n
	const maxRetry = config.retry.maxRetry || 50
	let committed = 0n
	// atomic spend-cap accounting / spend-cap atomic
	const budget = {
		spendCapHit: false,
		fits(extra) { return cap <= 0n || committed + extra <= cap },
		commit(extra) { committed += extra },
	}

	let result = { status: "open-failed", stopReason: "fatal" }

	// terminal check (priority order) / terminal စစ် (priority အစဉ်)
	const terminal = () => {
		if (control.stopped) return { status: "aborted", stopReason: "manual" }
		const minted = states.find((s) => s._mined)
		if (minted) { report.setSuccess(minted._mined); return { status: "minted", stopReason: "success", minted } }
		if (budget.spendCapHit) return { status: "open-failed", stopReason: "spendCap" }
		const totalAttempts = states.reduce((n, s) => n + s.attempts, 0)
		if (totalAttempts >= maxRetry) return { status: "open-failed", stopReason: "maxRetry" }
		const active = states.some((s) => s.status === "pending" || s.status === "sending")
		if (!active) return { status: "open-failed", stopReason: "fatal" }
		return null
	}

	// main loop / အဓိက loop
	while (true) {
		const done = terminal()
		if (done) { result = done; break }

		const now = Date.now()
		for (const st of states) {
			if (st.status !== "pending") continue
			if (st.sending) continue
			if (st.backoffUntil && now < st.backoffUntil) continue // RPC backoff / backoff စောင့်
			st.status = "sending"
			void attemptOnce(rpc, st, ctx, report, budget) // fire-and-forget; serialized per wallet
		}

		await sleep(SPAM_INTERVAL_MS)

		// passive confirmation sweep / mine ဖြစ်လားစစ်
		for (const st of states) {
			if (st._mined || !st.hashes.length) continue
			const conf = await checkConfirmation(rpc, st)
			if (conf.settled) {
				if (conf.success) st._mined = conf.hash || st.hashes[st.hashes.length - 1]
				else { st.status = "dropped"; report.recordWallet(st) } // nonce gone, no success / nonce ကုန်
			}
		}
	}

	// drain in-flight sends, then finalize wallet rows / in-flight ပြီးအောင်စောင့်
	control.stop(result.stopReason)
	const drainUntil = Date.now() + DRAIN_MS
	while (states.some((s) => s.sending) && Date.now() < drainUntil) await sleep(50)
	for (const st of states) {
		if (st._mined) { st.status = "mined"; st.txHash = st._mined }
		report.recordWallet(st)
	}
	return result
}

module.exports = { runSpam, checkConfirmation, SPAM_INTERVAL_MS }
