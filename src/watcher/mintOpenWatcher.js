// MintOpenWatcher — compose hub signals into one decisive "mintOpen"
// signal အားလုံးပောင်းပြီး mintOpen ဆုံးဖြတ်ချက်တခုထုတ်

const logger = require("../logger/logger")

class MintOpenWatcher {
	// trigger:
	//  { type: "state", name, match(value)->bool }
	//  { type: "event", eventName }
	//  { type: "block", atBlock }
	constructor(hub, trigger) {
		this.hub = hub
		this.trigger = trigger
		this.fired = false
		this._bind()
	}

	_bind() {
		this.hub.on("stateChange", (e) => {
			if (this.fired || this.trigger.type !== "state") return
			if (e.name === this.trigger.name && this.trigger.match(e.value)) this._fire("state", e)
		})
		this.hub.on("log", (e) => {
			if (this.fired || this.trigger.type !== "event") return
			if (e.name === this.trigger.eventName) this._fire("event", e)
		})
		this.hub.on("block", (e) => {
			if (this.fired || this.trigger.type !== "block") return
			if (e.blockNumber >= this.trigger.atBlock) this._fire("block", e)
		})
	}

	// fire once — mint-critical log / တခါတည်း emit
	_fire(source, detail) {
		this.fired = true
		logger.tx(`[mintOpen] triggered by ${source}`)
		this.hub.emit("mintOpen", { source, detail })
	}

	// re-arm after a failed attempt / retry အတွက် ပြန်ဖွင့်
	rearm() { this.fired = false }

	// consumer of the bus — no ws lifecycle / bus နားထောင်၊ no-op
	start() {}
	stop() {}
}

module.exports = MintOpenWatcher
