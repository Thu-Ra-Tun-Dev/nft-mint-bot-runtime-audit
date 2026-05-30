// StateWatcher — poll view fns each block, emit on change
// event မရှိတဲ့ contract အတွက် block တိုင်း view fn ဖတ်၊ ပြောင်းရင် emit

const { Contract } = require("ethers")

class StateWatcher {
	constructor(hub, { address, abi, reads }) {
		this.hub = hub
		this.address = address
		this.abi = abi
		this.reads = reads // [{ name, args? }]
		this.provider = null
		this.contract = null
		this.last = {}     // last value per read / နောက်ဆုံးတန်ဖိုး
		this._onBlock = null
	}

	start(provider) {
		this.stop()
		this.provider = provider
		this.contract = new Contract(this.address, this.abi, provider)
		this._onBlock = async () => {
			for (const r of this.reads) {
				try {
					const val = await this.contract[r.name](...(r.args || []))
					const str = String(val)
					if (this.last[r.name] !== str) { // changed only / ပြောင်းမှ
						this.last[r.name] = str
						this.hub.emit("stateChange", { name: r.name, value: val })
					}
				} catch (_) {}
			}
		}
		provider.on("block", this._onBlock)
	}

	stop() {
		if (this.provider && this._onBlock) {
			try { this.provider.off("block", this._onBlock) } catch (_) {}
		}
		this._onBlock = null
	}
}

module.exports = StateWatcher
