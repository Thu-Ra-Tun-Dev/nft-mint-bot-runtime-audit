// TxSimulator — dry-run the assembled tx via eth_call; classify failure (reuse failRecovery)
// စုစည်းပြီးသား tx ကို eth_call simulate၊ error ကို failRecovery နဲ့ class ခွဲ

const rpc = require("../rpc/rpcManager")
const { classifyError } = require("../retry/failRecovery")
const { parseRevert } = require("../phase/revertParser")
const logger = require("../logger/logger")

// simulate final calldata at the proxy entrypoint / proxy ကို eth_call
async function simulateTx(tx, { from = null } = {}) {
	const provider = rpc.getProvider()
	const call = {
		to: tx.to,
		data: tx.data,
		value: tx.value || 0n,
		from: from || tx.from || undefined,
	}
	try {
		const returnData = await rpc.call(provider, "call", call)
		return { ok: true, returnData, reason: null, classification: null }
	} catch (err) {
		const parsed = parseRevert(err)            // decode revert reason / reason decode
		const classification = classifyError(err)  // retryable/fatal (no new taxonomy)
		logger.debug(`[tx] simulate revert: ${parsed.reason || classification.reason}`)
		return { ok: false, returnData: null, reason: parsed.reason, errorSelector: parsed.errorSelector, classification, error: err }
	}
}

module.exports = { simulateTx }
