// FailRecovery — classify send errors -> retryable/fatal + recovery action
// tx error တွေကို retryable/fatal ခွဲ၊ recovery action ပြန်ပေး

const { RETRY_CLASS } = require("../config/constants")
const nonceManager = require("../wallet/nonceManager")

// returns { class, action, reason }; action: failover|resync|bump|drop|mined
function classifyError(err) {
	const code = err && err.code
	const msg = ((err && (err.shortMessage || err.message)) || "").toLowerCase()

	// our replacement already mined (ethers TRANSACTION_REPLACED) -> success path
	// replacement က mine ဖြစ်ပြီးသား -> success
	if (code === "TRANSACTION_REPLACED") {
		if (err.receipt && err.receipt.status === 1) return { class: RETRY_CLASS.RETRYABLE, action: "mined", reason: "replaced-mined" }
		return { class: RETRY_CLASS.RETRYABLE, action: "bump", reason: "repriced" }
	}

	// FATAL — retry လုပ်လို့မရ (wallet drop)
	if (code === "INSUFFICIENT_FUNDS" || /insufficient funds/.test(msg))
		return { class: RETRY_CLASS.FATAL, action: "drop", reason: "insufficient-funds" }
	if (/invalid proof|not (allow|white) ?list|invalid sig|bad sig|unauthor|signer|not a? ?holder|merkle/.test(msg))
		return { class: RETRY_CLASS.FATAL, action: "drop", reason: "gate-unmet" }

	// RETRYABLE — recover and continue / recover ပြီးဆက်
	if (code === "NONCE_EXPIRED" || /nonce too low|nonce has already been used|already known/.test(msg))
		return { class: RETRY_CLASS.RETRYABLE, action: "resync", reason: "nonce" }
	if (code === "REPLACEMENT_UNDERPRICED" || /replacement (transaction )?underpriced|fee too low|max fee per gas|underpriced/.test(msg))
		return { class: RETRY_CLASS.RETRYABLE, action: "bump", reason: "underpriced" }
	if (/intrinsic gas too low|out of gas|gas limit/.test(msg))
		return { class: RETRY_CLASS.RETRYABLE, action: "bump", reason: "gas-limit" }
	if (code === "TIMEOUT" || code === "SERVER_ERROR" || code === "NETWORK_ERROR" || /timeout|rate ?limit|429|503|econnreset|fetch failed|bad response/.test(msg))
		return { class: RETRY_CLASS.RETRYABLE, action: "failover", reason: "rpc" }

	// revert at send time during open phase -> usually gate/limit -> drop wallet
	if (code === "CALL_EXCEPTION")
		return { class: RETRY_CLASS.FATAL, action: "drop", reason: "revert" }

	// unknown -> cautious retry (bounded by maxRetry) / မသိရင် သတိနဲ့ retry
	return { class: RETRY_CLASS.RETRYABLE, action: "failover", reason: "unknown" }
}

// apply recovery side-effects / recovery side-effect
function applyRecovery(action, walletState) {
	if (action === "resync") {
		// nonce consumed/stuck -> reset; force re-reserve of a fresh nonce next attempt
		// nonce ကုန်/တင်ကျန် -> reset ပြီး နောက်တကြိမ် fresh nonce ပြန်ယူ
		nonceManager.reset(walletState.address)
		walletState.nonce = null
	}
	// "failover" handled by rpcManager.getProvider() auto-selection next call
}

module.exports = { classifyError, applyRecovery }
