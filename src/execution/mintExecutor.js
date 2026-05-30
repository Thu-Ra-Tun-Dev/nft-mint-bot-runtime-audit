// MintExecutor — single-tx lifecycle: build (P18) -> send -> ws confirm -> recover -> resend -> track
// tx တခု lifecycle: build(P18) -> send -> ws confirm -> recover -> bump-resend -> success track
// Orchestrator only; reuses P18 buildTxRequest, P16 failRecovery + gasController, P7 nonceManager, P6 rpcManager

const { getAddress } = require("ethers")
const { buildTxRequest } = require("../tx")
const { classifyError, applyRecovery } = require("../retry/failRecovery")
const { maxGasCost } = require("../retry/gasController")
const config = require("../config/settings")
const logger = require("../logger/logger")
const { sendTx } = require("./txSender")
const { waitForConfirmation } = require("./confirmationWatcher")
const { ExecutionTracker } = require("./executionTracker")

// extract a reusable "previous fees" object from a built tx (feeds P18 replacement bump)
// built tx ကနေ previous fee object ဆွဲ (P18 replacement bump အတွက်)
function feesFromTx(tx) {
	if (!tx) return null
	if (tx.type === 2 || tx.maxFeePerGas != null) {
		return { type: 2, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }
	}
	return { type: 0, gasPrice: tx.gasPrice }
}

// spend-cap guard using gas ceiling + value / spend cap စစ်
function withinSpendCap(tx) {
	try {
		const cap = config.retry && config.retry.spendCapWei
		if (!cap) return true
		const gasCeil = maxGasCost(feesFromTx(tx), tx.gasLimit || 0n)
		return gasCeil + (tx.value || 0n) <= cap
	} catch (_) { return true }
}

// shared error handling -> recovery side-effects + terminal decision / error handling ပေါင်း
function handleSendError(err, tracker) {
	const c = classifyError(err)
	// replacement already mined (TRANSACTION_REPLACED ok) -> success / replacement mine ပြီးသား
	if (c.action === "mined") {
		const receipt = err && err.receipt
		const confirmation = receipt
			? { mined: true, success: receipt.status === 1, txHash: receipt.hash || receipt.transactionHash, blockNumber: receipt.blockNumber, gasUsedWei: receipt.gasUsed != null ? receipt.gasUsed.toString() : null, confirmSource: "replaced" }
			: {}
		return { terminal: true, status: confirmation.success ? "replaced" : "failed", success: !!confirmation.success, stopReason: confirmation.success ? "success" : "fatal", confirmation }
	}
	tracker.recordRecovery(c.action, err)
	applyRecovery(c.action, tracker.wallet) // resync clears held nonce via nonceManager + walletState
	if (c.class === "fatal" || c.action === "drop") return { terminal: true, status: "failed", success: false, stopReason: "fatal" }
	return { terminal: false, action: c.action }
}

// execute one mint to a terminal outcome / mint တခု အပြီးသတ်မှတ်အထိ
async function executeMint({
	strategy = null,
	phaseReport = null,
	retryContext = null,
	signer = null,
	from = null,
	overrides = {},
	confirmations = 1,
	confirmTimeoutMs = 60_000,
} = {}) {
	if (!signer) throw new Error("[exec] signer required")

	const recipient = from || signer.address
	const address = (retryContext && retryContext.target) || (strategy && strategy.address) || null

	const tracker = new ExecutionTracker({
		address: address ? getAddress(address) : null,
		phase: (phaseReport && phaseReport.activePhase) || (retryContext && retryContext.phase) || "unknown",
		source: (phaseReport && phaseReport.source) || (retryContext && retryContext.source) || "static",
		wallet: { address: signer.address, label: overrides.label || signer.address, nonce: null },
	})

	const maxRetry = (config.retry && config.retry.maxRetry) || 1
	let previousFees = null
	let heldNonce = overrides.nonce != null ? overrides.nonce : null
	let attempt = 0

	while (attempt < maxRetry) {
		attempt++

		// 1) build / rebuild (replacement) via Tx Builder (P18) / P18 build
		const built = await buildTxRequest({
			strategy, phaseReport, retryContext, signer, from: recipient,
			previous: previousFees,
			overrides: { ...overrides, ...(heldNonce != null ? { nonce: heldNonce } : {}) },
		})
		if (!built || !built.buildable) {
			logger.warn(`[exec] not buildable: ${built && built.reason}`)
			return tracker.build({ status: "aborted", success: false, stopReason: "fatal", confirmation: {} })
		}
		const tx = built.tx
		// hold the nonce P18 reserved; reuse it for every replacement (no per-resend reserve)
		// P18 reserve ထားတဲ့ nonce ကိုင်ထား၊ replacement တိုင်း nonce တူ
		if (heldNonce == null && tx.nonce != null) { heldNonce = tx.nonce; tracker.wallet.nonce = tx.nonce }
		const fees = feesFromTx(tx)

		// spend-cap guard before sending / မပို့ခင် spend cap
		if (!withinSpendCap(tx)) {
			logger.warn("[exec] spend cap reached; aborting")
			return tracker.build({ status: "aborted", success: false, stopReason: "spendCap", confirmation: {}, value: tx.value })
		}

		// 2) send (sign once, multi-RPC broadcast, serialized by nonceManager) / ပို့
		let sent
		try {
			sent = await sendTx(signer, tx)
			tracker.recordSend({ txHash: sent.hash, nonce: tx.nonce, fees, gasLimit: tx.gasLimit, action: attempt === 1 ? "send" : "resend" })
		} catch (err) {
			const handled = handleSendError(err, tracker)
			if (handled.terminal) return tracker.build({ status: handled.status, success: handled.success, stopReason: handled.stopReason, confirmation: handled.confirmation || {}, value: tx.value })
			if (handled.action === "bump") previousFees = fees       // bump baseline / bump baseline
			if (handled.action === "resync") { heldNonce = null; previousFees = null } // fresh nonce next / nonce ပြန်ယူ
			continue
		}

		// 3) confirm via websocket push (receipt-poll fallback) / ws confirm
		const confirmation = await waitForConfirmation(sent.hash, { confirmations, timeoutMs: confirmTimeoutMs, recipient })

		// 4a) mined / mine ဖြစ်
		if (confirmation.mined) {
			tracker.recordMined(confirmation, fees)
			if (confirmation.success) {
				logger.tx(`[exec] MINT SUCCESS hash=${confirmation.txHash} block=${confirmation.blockNumber}`)
				return tracker.build({ status: "minted", success: true, confirmation: { ...confirmation, confirmations }, stopReason: "success", value: tx.value })
			}
			// on-chain revert during open phase -> usually gate/limit -> fatal / on-chain revert
			tracker.recordRecovery("drop", new Error("reverted on-chain"))
			return tracker.build({ status: "failed", success: false, confirmation, stopReason: "fatal", value: tx.value })
		}

		// 4b) not mined within timeout -> stuck -> bump-resend with SAME held nonce / timeout -> bump resend
		logger.warn(`[exec] tx ${sent.hash} not confirmed in ${confirmTimeoutMs}ms; resending (bump)`)
		tracker.recordRecovery("bump", new Error("confirmation-timeout"))
		previousFees = fees // P18 will bump >= REPLACEMENT_FEE_BUMP, reuse held nonce / nonce တူပြန်သုံး
	}

	// retries exhausted / retry ကုန်
	return tracker.build({ status: "timeout", success: false, confirmation: {}, stopReason: "maxRetry" })
}

module.exports = { executeMint }
