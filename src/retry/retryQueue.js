// RetryQueue — per-wallet send/replace; nonce reserved ONCE, held across replacements
// wallet တခုချင်း nonce တကြိမ်ပဲ reserve၊ replacement တိုင်း nonce တူ၊ multi-RPC broadcast

const rpc = require("../rpc/rpcManager")
const nonceManager = require("../wallet/nonceManager")
const config = require("../config/settings")
const logger = require("../logger/logger")

const FALLBACK_GAS_LIMIT = 300000n

// reserve nonce ONCE per wallet, hold it across all replacements
// reserve() က next++ ဖြစ်လို့ တကြိမ်ပဲခေါ်ရ (replacement တိုင်းမခေါ်ရ)
async function reserveOnce(walletState) {
	if (walletState.nonce !== null && walletState.nonce !== undefined) return walletState.nonce
	walletState.nonce = await nonceManager.reserve(walletState.wallet.signer)
	logger.debug(`[retry] ${walletState.wallet.label} reserved nonce ${walletState.nonce}`)
	return walletState.nonce
}

// estimate gas limit once, cache, apply buffer / gasLimit တကြိမ်ခန့်မှန်း
async function ensureGasLimit(walletState, ctx) {
	if (walletState.gasLimit) return walletState.gasLimit
	const provider = rpc.getProvider()
	const buffer = config.gas.limitBuffer || 1.2
	try {
		const est = await rpc.call(provider, "estimateGas", {
			to: ctx.target, data: ctx.encode(), value: ctx.value, from: walletState.wallet.address,
		})
		walletState.gasLimit = (est * BigInt(Math.round(buffer * 100))) / 100n
	} catch (e) {
		// estimate failed (gate/args) -> fixed fallback / estimate fail -> fallback
		walletState.gasLimit = FALLBACK_GAS_LIMIT
		logger.debug(`[retry] gas estimate failed for ${walletState.wallet.label}; fallback ${FALLBACK_GAS_LIMIT}`)
	}
	return walletState.gasLimit
}

// build + sign + broadcast a (replacement) tx using the HELD nonce
// held nonce နဲ့ tx sign ပြီး provider အများကို broadcast (hash တူ၊ idempotent)
async function broadcast(walletState, ctx, fees) {
	const signer = walletState.wallet.signer
	const nonce = walletState.nonce

	const tx = {
		to: ctx.target,
		data: ctx.encode(),
		value: ctx.value,
		nonce,                      // SAME nonce every replacement / nonce တူ
		gasLimit: walletState.gasLimit,
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

	// sign ONCE then broadcast to many providers / တကြိမ်ပဲ sign၊ အများကိုပို့
	const signed = await signer.signTransaction(tx)
	const providers = (config.features.multiRpcBroadcast ? rpc.getAllProviders() : [rpc.getProvider()]).filter(Boolean)
	if (providers.length === 0) throw new Error("[retry] no provider to broadcast")

	// serialize per wallet (fast task; does NOT wait for mining) / broadcast serialize
	const dedupeKey = `${walletState.address}:${nonce}:${signed.slice(0, 24)}`
	return nonceManager.enqueue(walletState.address, async () => {
		const results = await Promise.allSettled(providers.map((p) => rpc.call(p, "broadcastTransaction", signed)))
		let response = null
		const errors = []
		for (const r of results) {
			if (r.status === "fulfilled" && r.value) { response = r.value; break }
			if (r.status === "rejected") errors.push(r.reason)
		}
		// all providers rejected -> surface first error for classification / error ပြန်
		if (!response) throw errors[0] || new Error("[retry] broadcast failed on all providers")
		logger.tx(`[retry] ${walletState.wallet.label} sent nonce=${nonce} hash=${response.hash}`)
		return { hash: response.hash, response }
	}, dedupeKey)
}

module.exports = { reserveOnce, ensureGasLimit, broadcast, FALLBACK_GAS_LIMIT }
