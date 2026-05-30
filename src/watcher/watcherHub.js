// WatcherHub — mux + event bus + reconnect rebind (uses rpcManager)
// watcher အားလုံးကို စုစည်း၊ ws ပြန်ဆက်ရင် provider ပြောင်းတာဖမ်းပြီး re-subscribe

const EventEmitter = require("events")
const rpc = require("../rpc/rpcManager")
const logger = require("../logger/logger")
const { HEARTBEAT_INTERVAL_MS } = require("../config/constants")

class WatcherHub extends EventEmitter {
	constructor() {
		super()
		this.watchers = []   // registered strategies
		this.provider = null
		this.monitorTimer = null
	}

	// register a watcher; start immediately if hub already running
	register(watcher) {
		this.watchers.push(watcher)
		if (this.provider) {
			try { watcher.start(this.provider) } catch (_) {}
		}
		return this
	}

	// start all watchers + reconnect monitor / watcher အားလုံးစ
	start() {
		this.provider = rpc.getProvider()
		for (const w of this.watchers) {
			try { w.start(this.provider) } catch (_) {}
		}
		this._startMonitor()
		logger.info(`[hub] started with ${this.watchers.length} watcher(s)`)
	}

	// reconnect integration — wsClient recreates provider on reconnect;
	// detect the instance swap and rebind every watcher (dedup is per-watcher)
	// ws ပြန်ဆက်ရင် provider instance ပြောင်း၊ ဖမ်းပြီး watcher အားလုံး rebind
	_startMonitor() {
		this._stopMonitor()
		this.monitorTimer = setInterval(() => {
			let live = rpc.getWsProvider()
			if (!live) { try { live = rpc.getHealthyProvider() } catch (_) { live = null } }
			if (live && live !== this.provider) {
				logger.warn("[hub] provider changed; rebinding watchers")
				this.provider = live
				for (const w of this.watchers) {
					try { w.stop() } catch (_) {}
					try { w.start(this.provider) } catch (_) {}
				}
			}
		}, HEARTBEAT_INTERVAL_MS)
	}

	_stopMonitor() {
		if (this.monitorTimer) clearInterval(this.monitorTimer)
		this.monitorTimer = null
	}

	stop() {
		this._stopMonitor()
		for (const w of this.watchers) {
			try { w.stop() } catch (_) {}
		}
		this.removeAllListeners()
		logger.info("[hub] stopped")
	}
}

// single shared instance / တစ်ခုတည်းသုံး
module.exports = new WatcherHub()
