// MempoolWatcher — pending tx to the contract (degrades if RPC unsupported)
// mempool ထဲ contract ကိုသွားတဲ့ pending tx ဖမ်း (RPC support မှ)

const logger = require("../logger/logger")

class MempoolWatcher {
	constructor(hub, { address }) {
		this.hub = hub
		this.address = address.toLowerCase()
		this.provider = null
		this._handler = null
		this.supported = true
	}

	async start(provider) {
		this.stop()
		this.provider = provider
		this._handler = async (txHash) => {
			try {
				const tx = await provider.getTransaction(txHash)
				// only txs hitting our contract / contract ကိုသွားတာပဲ
				if (tx && tx.to && tx.to.toLowerCase() === this.address) {
					this.hub.emit("pendingTx", { hash: txHash, from: tx.from, data: tx.data })
				}
			} catch (_) {}
		}
		try {
			// many public RPCs reject "pending" / အများစုက mempool မပေး
			await provider.on("pending", this._handler)
		} catch (_) {
			this.supported = false
			logger.warn("[mempool] pending subscription unsupported; degrade to StateWatcher")
		}
	}

	stop() {
		if (this.provider && this._handler) {
			try { this.provider.off("pending", this._handler) } catch (_) {}
		}
		this._handler = null
	}
}

module.exports = MempoolWatcher
