// Retry entry — runRetry() orchestrates arm -> wait-for-open -> spam -> RetryReport
// arm -> open စောင့် -> spam -> RetryReport အဆုံးထိ orchestrate

const rpc = require("../rpc/rpcManager")
const keystore = require("../wallet/keystore")
const { buildRetryContext } = require("./retryContext")
const { waitForOpen } = require("./simulateLoop")
const { runSpam } = require("./spamController")
const { RetryReport } = require("./retryReport")
const logger = require("../logger/logger")

// manual stop handle / manual stop အတွက်
function createControl() {
	return {
		stopped: false,
		reason: null,
		stop(reason) { this.stopped = true; this.reason = reason || "manual" },
	}
}

// public entry / အဓိက entry
async function runRetry({ analysis, strategy, phaseReport, mintArgs = null, value = 0n, from = null, control = null, options = {} } = {}) {
	keystore.connect(rpc.getProvider()) // ensure signers have a provider / signer ကို provider ချိတ်
	const ctx = buildRetryContext({ analysis, strategy, phaseReport, mintArgs, value })

  console.log("[RETRY CTX RETURNED]")
  console.log("[RETRY TARGET]", ctx.target)
  console.log("[RETRY PRIMARY]", ctx.primary?.name)

	const ctrl = control || createControl()
	const report = new RetryReport(ctx)

	// 1) auto-simulate until open or timeout/stop / open အထိ poll
	const sender = from || keystore.primary().address
	const open = await waitForOpen(ctx, ctrl, { ...options, from: sender })
	if (!open.open) {
		const status = open.reason === "stopped" ? "aborted" : "closed-timeout"
		const stopReason = open.reason === "stopped" ? "manual" : "timeout"
		logger.warn(`[retry] not opened (${open.reason}); ${open.polls} poll(s)`)
		return report.build(status, stopReason)
	}

	// 2) open -> spam across wallets / ဖွင့်ပြီ -> spam
	report.markOpen()
	const result = await runSpam(rpc, ctx, keystore, ctrl, report)
	ctrl.stop(result.stopReason)
	logger.tx(`[retry] done: ${result.status}/${result.stopReason}`)
	return report.build(result.status, result.stopReason)
}

module.exports = { runRetry, createControl }
