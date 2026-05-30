// EventWatcher — subscribe contract logs by topic, emit decoded events
// contract event log တွေကို topic နဲ့ subscribe လုပ်၊ decode ပြီး emit

const { Interface } = require("ethers")

class EventWatcher {
	constructor(hub, { address, abi, eventNames }) {
		this.hub = hub
		this.address = address
		this.iface = new Interface(abi)
		// topic0 list for requested events / လိုချင်တဲ့ event signature topic
		this.topics = eventNames
			? eventNames.map((n) => this.iface.getEvent(n).topicHash)
			: null
		this.provider = null
		this.filter = null
		this._handler = null
		this.seen = new Set() // dedup by log id / log ထပ်မဖမ်း
	}

	start(provider) {
		this.stop()
		this.provider = provider
		this.filter = { address: this.address, topics: this.topics ? [this.topics] : [] }
		this._handler = (log) => {
			const id = `${log.transactionHash}:${log.index}`
			if (this.seen.has(id)) return
			if (this.seen.size > 5000) this.seen.clear() // bound memory / memory ကန့်
			this.seen.add(id)
			let parsed = null
			try { parsed = this.iface.parseLog(log) } catch (_) {}
			this.hub.emit("log", {
				address: log.address,
				name: parsed && parsed.name,
				args: parsed && parsed.args,
				log,
			})
		}
		provider.on(this.filter, this._handler)
	}

	stop() {
		if (this.provider && this.filter && this._handler) {
			try { this.provider.off(this.filter, this._handler) } catch (_) {}
		}
		this._handler = null
	}
}

module.exports = EventWatcher
