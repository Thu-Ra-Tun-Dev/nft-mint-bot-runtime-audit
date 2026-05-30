// BlockWatcher — emit new block numbers / block အသစ်တိုင်း emit
class BlockWatcher {
	constructor(hub) {
		this.hub = hub
		this.provider = null
		this.lastBlock = 0   // dedup across reconnect / reconnect အပြီး ထပ်မဖမ်း
		this._handler = null
	}

	start(provider) {
		this.stop()
		this.provider = provider
		this._handler = (blockNumber) => {
			if (blockNumber <= this.lastBlock) return // already seen / ဖမ်းပြီးသား
			this.lastBlock = blockNumber
			this.hub.emit("block", { blockNumber })
		}
		provider.on("block", this._handler)
	}

	stop() {
		if (this.provider && this._handler) {
			try { this.provider.off("block", this._handler) } catch (_) {}
		}
		this._handler = null
	}
}

module.exports = BlockWatcher
