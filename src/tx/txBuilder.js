// TxBuilder — assemble a ready-to-sign TxRequest from MintStrategy + PhaseReport + RetryContext
// MintStrategy + PhaseReport + RetryContext ကို sign-ready TxRequest အဖြစ် စုစည်း
// fees=gasController, nonce=nonceManager, estimate/sim=rpcManager (duplicate module မဆောက်)

const { getAddress, ZeroAddress } = require("ethers")
const rpc = require("../rpc/rpcManager")
const nonceManager = require("../wallet/nonceManager")
const config = require("../config/settings")
const logger = require("../logger/logger")
const { computeFees, maxGasCost } = require("../retry/gasController")
const { FALLBACK_GAS_LIMIT } = require("../retry/retryQueue")
const { buildCalldata } = require("./calldataBuilder")
const { simulateTx } = require("./txSimulator")

// resolve target entrypoint — ALWAYS the proxy address, never codeTarget(impl)
// to = proxy address (storage proxy မှာ၊ codeTarget မဟုတ်)
function resolveTarget({ retryContext, strategy }) {
	if (retryContext && retryContext.target) return getAddress(retryContext.target)
	if (strategy && strategy.address) return getAddress(strategy.address)
	throw new Error("[tx] no target address")
}

// pick the function to call / ခေါ်မယ့် function ရွေး
function resolvePrimary({ retryContext, strategy }) {
	const primary = (retryContext && retryContext.primary) || (strategy && strategy.primary)
	if (!primary || !primary.signature) throw new Error("[tx] no mint strategy/primary to build")
	return primary
}

// gating-aware build check: required gate arg missing -> not buildable
// gate (proof/sig) လိုပေမယ့် arg မပါရင် build မလုပ်
function checkGate(gating = {}, named, hasArgs) {
	if (hasArgs) return null // explicit args -> caller owns correctness
	if (gating.needsProof && !(named && named.proof !== undefined)) return "gate-unmet:proof"
	if (gating.needsSignature && !(named && named.signature !== undefined)) return "gate-unmet:signature"
	return null
}

// estimate gas once, apply config buffer, fallback on failure / gasLimit ခန့်မှန်း
async function estimateGasLimit({ to, data, value, from }) {
	const provider = rpc.getProvider()
	const buffer = config.gas.limitBuffer || 1.2
	try {
		const est = await rpc.call(provider, "estimateGas", { to, data, value, from })
		return { gasLimit: (est * BigInt(Math.round(buffer * 100))) / 100n, estimatedGas: est, usedFallback: false }
	} catch (e) {
		logger.debug(`[tx] gas estimate failed; fallback ${FALLBACK_GAS_LIMIT}: ${e && e.message}`)
		return { gasLimit: FALLBACK_GAS_LIMIT, estimatedGas: null, usedFallback: true }
	}
}

// main: build a TxRequest (ready for retryQueue.broadcast / signer.signTransaction)
// args precedence: overrides.args(array) > retryContext.args > named map > placeholders
async function buildTxRequest({
	strategy = null,
	phaseReport = null,
	retryContext = null,
	signer = null,
	from = null,
	previous = null,     // previous fees -> replacement (same nonce, bump) / replacement
	overrides = {},
} = {}) {
	const to = resolveTarget({ retryContext, strategy })
	const primary = resolvePrimary({ retryContext, strategy })
	const gating = (phaseReport && phaseReport.gating) || (retryContext && retryContext.gating) || {}

	const sender = (signer && signer.address) || from || (retryContext && retryContext.from) || null

	// args resolution / arg ရွေး
	const explicitArgs = Array.isArray(overrides.args)
		? overrides.args
		: (retryContext && Array.isArray(retryContext.args) ? retryContext.args : null)
	const named = overrides.named || null
	const hasArgs = Array.isArray(explicitArgs)

	// gate check (skipped when explicit args supplied) / gate စစ်
	const gateReason = checkGate(gating, named, hasArgs)
	if (gateReason) {
		logger.warn(`[tx] not buildable: ${gateReason}`)
		return { buildable: false, reason: gateReason, to, selector: primary.selector, signature: primary.signature }
	}

	// 1) calldata / calldata ဆောက်
	const { data, args } = buildCalldata({
		signature: primary.signature,
		name: primary.name,
		args: explicitArgs,
		named,
		from: sender || ZeroAddress,
	})

	// 2) value / value
	let value = 0n
	const rawValue = overrides.value !== undefined ? overrides.value : (retryContext && retryContext.value)
	try { value = BigInt(rawValue || 0n) } catch (_) { value = 0n }

	// 3) fees (reuse gasController; previous != null -> replacement bump) / fee
	const fees = await computeFees(previous)

	// 4) gas limit (estimate + buffer, fallback) / gasLimit
	const { gasLimit, estimatedGas, usedFallback } = await estimateGasLimit({ to, data, value, from: sender })

	// 5) nonce — held nonce for replacement, else reserve ONCE (never per replacement)
	// replacement = overrides.nonce; ပထမဆုံး build မှ reserve (next++)
	let nonce = overrides.nonce
	let reserved = false
	if (nonce === undefined || nonce === null) {
		if (!signer) throw new Error("[tx] signer required to reserve a nonce")
		nonce = await nonceManager.reserve(signer)
		reserved = true
	}

	// 6) assemble ethers v6 TransactionRequest / TxRequest စုစည်း
	const tx = {
		to,
		from: sender || undefined,
		data,
		value,
		nonce,
		gasLimit,
		chainId: config.chainId,
	}
	if (fees.type === 2) {
		tx.type = 2
		tx.maxFeePerGas = fees.maxFeePerGas
		tx.maxPriorityFeePerGas = fees.maxPriorityFeePerGas
	} else {
		tx.type = 0
		tx.gasPrice = fees.gasPrice
	}

	// 7) optional simulation (gated by feature toggle) / simulate (toggle)
	const doSim = overrides.simulate !== undefined ? overrides.simulate : config.features.simulateBeforeSend
	let sim = { ok: null, status: "skipped" }
	if (doSim) {
		const r = await simulateTx(tx, { from: sender })
		sim = r.ok
			? { ok: true, status: "ok" }
			: { ok: false, status: "revert", reason: r.reason, classification: r.classification }
	}

	tx.__meta = {
		buildSource: hasArgs ? "explicit" : (named ? "named" : "placeholder"),
		args,
		simulated: doSim,
		simStatus: sim.status,
		simReason: sim.reason || null,
		classification: (sim.classification && sim.classification.class) || null,
		feeType: fees.type,
		feeSource: previous ? "bumped" : "market",
		estimatedGas,
		usedFallbackGas: usedFallback,
		maxGasCostWei: maxGasCost(fees, gasLimit),
		replacement: !!previous,
		reservedNonce: reserved,
		selector: primary.selector,
		signature: primary.signature,
		phase: phaseReport && phaseReport.activePhase,
		gate: gating.gate || null,
	}

	logger.debug(`[tx] built ${primary.name} to=${to} nonce=${nonce} type=${fees.type} gas=${gasLimit} sim=${sim.status}`)
	return { buildable: true, tx }
}

module.exports = { buildTxRequest }
