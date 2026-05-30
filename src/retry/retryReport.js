// RetryReport — accumulate run telemetry -> the RetryReport object (Phase 15 shape)
// run telemetry စုပြီး RetryReport (Phase 15 shape) ထုတ်

const { toGwei } = require("./gasController")

class RetryReport {
	constructor(ctx) {
		this.ctx = ctx
		this.armedAt = Date.now()
		this.openedAt = null
		this.firstSendAt = null
		this.settledAt = null
		this.attempts = 0
		this.bumps = 0
		this.successTxHash = null
		this.lastMaxFeeGwei = null
		this.lastPriorityGwei = null
		this.wallets = new Map() // address -> per-wallet outcome
	}

	// sale opened / sale ဖွင့်ချိန်မှတ်
	markOpen() { if (!this.openedAt) this.openedAt = Date.now() }

	_wallet(st) {
		if (!this.wallets.has(st.address)) {
			this.wallets.set(st.address, { address: st.address, label: st.wallet.label, attempts: 0, lastNonce: null, txHash: null, status: "pending", lastError: null })
		}
		return this.wallets.get(st.address)
	}

	// record one attempt + gas snapshot / attempt တခုနဲ့ gas မှတ်
	recordAttempt(st, fees) {
		if (!this.firstSendAt) this.firstSendAt = Date.now()
		this.attempts++
		if (st.attempts > 1) this.bumps++ // replacement = bump / replacement ဆို bump
		const w = this._wallet(st)
		w.attempts = st.attempts
		w.lastNonce = st.nonce
		if (fees) {
			if (fees.type === 2) { this.lastMaxFeeGwei = toGwei(fees.maxFeePerGas); this.lastPriorityGwei = toGwei(fees.maxPriorityFeePerGas) }
			else { this.lastMaxFeeGwei = toGwei(fees.gasPrice); this.lastPriorityGwei = null }
		}
	}

	// sync per-wallet status/error/hash / wallet status update
	recordWallet(st) {
		const w = this._wallet(st)
		w.status = st.status
		w.lastError = st.lastError && (st.lastError.reason || st.lastError.message || String(st.lastError))
		if (st.hashes && st.hashes.length) w.txHash = st.hashes[st.hashes.length - 1]
		w.lastNonce = st.nonce
		w.attempts = st.attempts
	}

	// terminal success / success မှတ်
	setSuccess(txHash) {
		this.successTxHash = txHash
		this.settledAt = Date.now()
	}

	// finalize -> RetryReport shape / RetryReport object ဆောက်
	build(status, stopReason) {
		if (!this.settledAt) this.settledAt = Date.now()
		return {
			address: this.ctx.target,
			phase: this.ctx.phase,
			status,
			attempts: this.attempts,
			wallets: [...this.wallets.values()],
			successTxHash: this.successTxHash,
			gas: { lastMaxFeeGwei: this.lastMaxFeeGwei, lastPriorityGwei: this.lastPriorityGwei, bumps: this.bumps },
			timings: {
				armedAt: this.armedAt,
				openedAt: this.openedAt,
				firstSendAt: this.firstSendAt,
				settledAt: this.settledAt,
				totalMs: this.settledAt - this.armedAt,
			},
			stopReason,
			source: this.ctx.source,
		}
	}
}

module.exports = { RetryReport }
