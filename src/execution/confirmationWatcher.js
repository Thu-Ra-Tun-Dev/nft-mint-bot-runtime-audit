// ConfirmationWatcher — websocket-push tx confirmation, receipt-poll fallback, mint evidence
// websocket push နဲ့ tx confirm၊ မရရင် receipt poll fallback၊ mint Transfer evidence cross-check
// New confirmation logic only (spamController.checkConfirmation ႀသည် poll/hash-scan + spam-loop coupled)

const { id, getAddress } = require("ethers")
const rpc = require("../rpc/rpcManager")
const logger = require("../logger/logger")

// standard transfer event topics — computed from signatures at runtime (ERC standard, not project hardcode)
// ERC စံ event topic — signature ကနေ runtime တွက် (project hardcode မဟုတ်)
const TOPIC_ERC721_TRANSFER = id("Transfer(address,address,uint256)")
const TOPIC_ERC1155_SINGLE = id("TransferSingle(address,address,address,uint256,uint256)")
const TOPIC_ERC1155_BATCH = id("TransferBatch(address,address,address,uint256[],uint256[])")
const ZERO_TOPIC = "0x" + "00".repeat(32)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// pad an address into a 32-byte log topic / address ကို topic အဖြစ် pad
function addressTopic(address) {
	return ("0x" + "0".repeat(24) + getAddress(address).slice(2)).toLowerCase()
}

// detect a mint-style Transfer (from zero, or to our wallet) in receipt logs
// receipt log ထဲ mint Transfer (from zero / to wallet) ရှိမရှိ
function hasMintEvidence(receipt, recipient) {
	if (!receipt || !receipt.logs) return false
	const recip = recipient ? addressTopic(recipient) : null
	for (const log of receipt.logs) {
		const topics = log.topics || []
		const t0 = (topics[0] || "").toLowerCase()
		if (t0 === TOPIC_ERC721_TRANSFER) {
			const from = (topics[1] || "").toLowerCase()
			const to = (topics[2] || "").toLowerCase()
			if (from === ZERO_TOPIC) return true            // freshly minted / အသစ် mint
			if (recip && to === recip) return true
		} else if (t0 === TOPIC_ERC1155_SINGLE || t0 === TOPIC_ERC1155_BATCH) {
			const from = (topics[2] || "").toLowerCase() // _from is the 2nd indexed topic
			if (from === ZERO_TOPIC) return true
		}
	}
	return false
}

// normalize a mined receipt into a confirmation result / receipt ကို result အဖြစ်
function fromReceipt(receipt, recipient, confirmSource) {
	const success = !!receipt && receipt.status === 1
	return {
		mined: true,
		success,
		status: success ? "minted" : "failed",
		receipt,
		blockNumber: receipt.blockNumber != null ? receipt.blockNumber : null,
		gasUsedWei: receipt.gasUsed != null ? receipt.gasUsed.toString() : null,
		txHash: receipt.hash || receipt.transactionHash || null,
		mintEvidence: success ? hasMintEvidence(receipt, recipient) : false,
		confirmSource,
	}
}

// confirm via websocket push if available, else fall back to http receipt polling
// ws ရရင် push confirm၊ မရရင် http receipt poll fallback
async function waitForConfirmation(hash, options = {}) {
	const confirmations = options.confirmations || 1
	const timeoutMs = options.timeoutMs || 60_000
	const recipient = options.recipient || null
	const pollMs = options.pollIntervalMs || 1500
	const control = options.control || null
	const deadline = Date.now() + timeoutMs

	// 1) websocket push path / ws push
	const wsProvider = rpc.getWsProvider()
	if (wsProvider) {
		try {
			const receipt = await wsProvider.waitForTransaction(hash, confirmations, timeoutMs)
			if (receipt) return fromReceipt(receipt, recipient, "websocket")
		} catch (e) {
			logger.debug(`[exec] ws confirm fell back: ${e && e.message}`)
		}
	}

	// 2) http receipt polling fallback / http receipt poll
	while (Date.now() < deadline) {
		if (control && control.stopped) return { mined: false, success: false, status: "aborted", confirmSource: "polling", txHash: hash }
		try {
			const provider = rpc.getHealthyProvider()
			const receipt = await rpc.call(provider, "getTransactionReceipt", hash)
			if (receipt && receipt.blockNumber != null) {
				// honor confirmation depth when > 1 / confirmation အများလိုရင် head စစ်
				if (confirmations > 1) {
					const head = await rpc.call(provider, "getBlockNumber")
					if (head - receipt.blockNumber + 1 < confirmations) { await sleep(pollMs); continue }
				}
				return fromReceipt(receipt, recipient, "polling")
			}
		} catch (e) {
			logger.debug(`[exec] receipt poll error: ${e && e.message}`)
		}
		await sleep(pollMs)
	}

	// 3) not mined within timeout / timeout
	return { mined: false, success: false, status: "timeout", confirmSource: "polling", txHash: hash }
}

module.exports = { waitForConfirmation, hasMintEvidence }
