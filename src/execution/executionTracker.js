// ExecutionTracker — accumulate attempts + recovery counters into a MintExecutionResult
// attempt + recovery counter စုပြီး MintExecutionResult တည်ဆောက် (success tracking)
// Reuses gasController.toGwei for fee formatting (NO new gas module) / toGwei ပြန်သုံး

const { toGwei } = require("../retry/gasController")

class ExecutionTracker {
	constructor({ address, phase, wallet, source } = {}) {
		this.address = address || null
		this.phase = phase || "unknown"
		this.source = source || "static"
		this.wallet = wallet || null
		this.attempts = []
		this.recovery = { resyncs: 0, failovers: 0, bumps: 0, drops: 0 }
		this.timings = { builtAt: Date.now(), firstSendAt: null, minedAt: null, settledAt: null }
		this.spentWei = 0n
	}

	// fee object -> { feeType, maxFeeGwei, priorityGwei } / fee ကို gwei အဖြစ်
	_feeView(fees) {
		if (!fees) return { feeType: 0, maxFeeGwei: null, priorityGwei: null }
		const feeType = fees.type === 2 ? 2 : 0
		return {
			feeType,
			maxFeeGwei: toGwei(feeType === 2 ? fees.maxFeePerGas : fees.gasPrice),
			priorityGwei: feeType === 2 ? toGwei(fees.maxPriorityFeePerGas) : null,
		}
	}

	// record a send attempt (status pending until confirmed) / send attempt တခုမှတ်
	recordSend({ txHash, nonce, fees, gasLimit, action = "send" }) {
		if (this.timings.firstSendAt === null) this.timings.firstSendAt = Date.now()
		const fv = this._feeView(fees)
		const attempt = {
			txHash: txHash || null,
			nonce: nonce != null ? Number(nonce) : null,
			feeType: fv.feeType,
			maxFeeGwei: fv.maxFeeGwei,
			priorityGwei: fv.priorityGwei,
			gasLimit: gasLimit != null ? gasLimit.toString() : null,
			action,
			status: "pending",
			error: null,
			sentAt: Date.now(),
			minedAt: null,
		}
		this.attempts.push(attempt)
		return attempt
	}

	// tag the last attempt with a recovery action + error / recovery action မှတ်
	recordRecovery(action, err) {
		if (action === "resync") this.recovery.resyncs++
		else if (action === "failover") this.recovery.failovers++
		else if (action === "bump") this.recovery.bumps++
		else if (action === "drop") this.recovery.drops++
		const last = this.attempts[this.attempts.length - 1]
		if (last) {
			last.action = action
			last.status = action === "drop" ? "fatal" : "retried"
			last.error = (err && (err.shortMessage || err.message)) || (typeof err === "string" ? err : null)
		}
	}

	// mark the mined outcome on the last attempt / mine ဖြစ်တာမှတ်
	recordMined(confirmation, fees) {
		const last = this.attempts[this.attempts.length - 1]
		if (last) {
			last.status = confirmation.success ? "minted" : "reverted"
			last.minedAt = Date.now()
			if (confirmation.txHash) last.txHash = confirmation.txHash
		}
		this.timings.minedAt = Date.now()
		// best-effort spend accounting: gasUsed * fee ceiling / spend ခန့်မှန်း
		if (confirmation.gasUsedWei && fees) {
			const price = fees.type === 2 ? fees.maxFeePerGas : fees.gasPrice
			try { this.spentWei += BigInt(confirmation.gasUsedWei) * (price || 0n) } catch (_) {}
		}
	}

	// build the final MintExecutionResult / နောက်ဆုံး result ထုတ်
	build({ status, success, confirmation, stopReason, value = 0n }) {
		this.timings.settledAt = Date.now()
		const conf = confirmation || {}
		let spent = this.spentWei
		try { spent += BigInt(value || 0n) } catch (_) {}
		const lastFee = [...this.attempts].reverse().find((a) => a.maxFeeGwei != null)
		return {
			address: this.address,
			phase: this.phase,
			status,
			success: !!success,
			successTxHash: success ? (conf.txHash || null) : null,
			blockNumber: conf.blockNumber != null ? conf.blockNumber : null,
			confirmations: success ? (conf.confirmations || 1) : 0,
			gasUsedWei: conf.gasUsedWei || null,
			effectiveGasPriceGwei: lastFee ? lastFee.maxFeeGwei : null,
			mintEvidence: !!conf.mintEvidence,
			spentWei: spent.toString(),
			attempts: this.attempts,
			wallet: this.wallet
				? { address: this.wallet.address, label: this.wallet.label, finalNonce: this.wallet.nonce != null ? Number(this.wallet.nonce) : null, bumps: this.recovery.bumps }
				: null,
			recovery: this.recovery,
			confirmSource: conf.confirmSource || null,
			timings: { ...this.timings, totalMs: this.timings.settledAt - this.timings.builtAt },
			stopReason: stopReason || null,
			source: this.source,
		}
	}
}

module.exports = { ExecutionTracker }
