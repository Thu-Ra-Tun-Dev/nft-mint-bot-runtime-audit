// TxSender — sign a prebuilt P18 TxRequest and broadcast via rpcManager (thin adapter)
// P18 TxRequest ကို sign ပြီး rpcManager နဲ့ multi-RPC broadcast (sender အသစ်မဟုတ်၊ adapter သာ)
// Does NOT build tx / compute gas / reserve nonce — Tx Builder (P18) + nonceManager (P7) own those

const rpc = require("../rpc/rpcManager")
const nonceManager = require("../wallet/nonceManager")
const config = require("../config/settings")
const logger = require("../logger/logger")

// strip non-serializable __meta + from before signing / sign မလုပ်ခင် __meta ဖယ်
function toSignable(tx) {
	const { __meta, from, ...rest } = tx
	return rest
}

// sign once, broadcast to many providers, return first accepted response
// တကြိမ်ပဲ sign၊ provider အများကိုပို့၊ ပထမလက်ခံတဲ့ response ပြန်
async function sendTx(signer, tx) {
	const signed = await signer.signTransaction(toSignable(tx))

	const providers = (config.features.multiRpcBroadcast ? rpc.getAllProviders() : [rpc.getProvider()]).filter(Boolean)
	if (providers.length === 0) throw new Error("[exec] no provider to broadcast")

	// serialize per wallet via EXISTING nonceManager queue (no new queue) / nonceManager queue ပြန်သုံး
	const dedupeKey = `${signer.address}:${tx.nonce}:${signed.slice(0, 24)}`
	return nonceManager.enqueue(signer.address, async () => {
		const settled = await Promise.allSettled(providers.map((p) => rpc.call(p, "broadcastTransaction", signed)))
		let response = null
		const errors = []
		for (const r of settled) {
			if (r.status === "fulfilled" && r.value) { response = r.value; break }
			if (r.status === "rejected") errors.push(r.reason)
		}
		// all providers rejected -> surface first error for failRecovery / error ပြန်တင်
		if (!response) throw errors[0] || new Error("[exec] broadcast failed on all providers")
		logger.tx(`[exec] sent nonce=${tx.nonce} hash=${response.hash}`)
		return { hash: response.hash, response, signed }
	}, dedupeKey)
}

module.exports = { sendTx }
