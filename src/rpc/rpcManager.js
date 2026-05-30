// RPC Manager — ws primary + http fallback pool, health/latency scoring, failover
// ws က ပြီး http တွေ fallback၊ latency တိုင်းပြီး health score နဲ့ အကောင်းဆုံးရွေး

const { JsonRpcProvider } = require("ethers")
const config = require("../config/settings")
const logger = require("../logger/logger")
const WsClient = require("./wsClient")

// timeout wrapper — နှေးနေတဲ့ rpc ကို ပြတ်ထုတ် / reject after ms
function withTimeout(promise, ms, label) {
	return new Promise((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms)
		promise.then(
			(v) => { clearTimeout(t); resolve(v) },
			(e) => { clearTimeout(t); reject(e) },
		)
	})
}

class RpcManager {
	constructor() {
		this.timeoutMs = config.rpc.timeoutMs
		// http fallback pool — staticNetwork: chainId ထပ်မမေးဘဲ မြန်
		this.http = config.rpc.httpUrls.map((url) => ({
			url,
			provider: new JsonRpcProvider(url, config.chainId, { staticNetwork: true }),
			healthy: true,
			latency: Infinity,
			score: 0,
		}))
		// ws primary — first ws url / ws ပထမဆုံး
		this.ws = config.rpc.wsUrls.length ? new WsClient(config.rpc.wsUrls[0]) : null
	}

	// probe one provider — measure latency + set health/score
	async _probe(entry) {
		const start = Date.now()
		try {
			await withTimeout(entry.provider.getBlockNumber(), this.timeoutMs, entry.url)
			entry.latency = Date.now() - start
			entry.healthy = true
		} catch (_) {
			entry.latency = Infinity
			entry.healthy = false
		}
		// score — healthy + low latency = high / latency နည်းရင် score မြင့်
		entry.score = entry.healthy ? 1 / (entry.latency + 1) : 0
		return entry
	}

	// health check all http providers in parallel
	async healthCheck() {
		await Promise.all(this.http.map((e) => this._probe(e)))
		const ok = this.http.filter((e) => e.healthy).length
		logger.info(`[rpc] health check ${ok}/${this.http.length} healthy`)
		return this.http
	}

	// ws provider if alive, else null / ws သေနေရင် null
	getWsProvider() {
		return this.ws && this.ws.isAlive() ? this.ws.getProvider() : null
	}

	// healthiest http provider — failover selection / latency အနိမ့်ဆုံးရွေး
	getHealthyProvider() {
		if (!this.http.length) throw new Error("[rpc] no http providers configured")
		const ranked = [...this.http].sort((a, b) => b.score - a.score)
		return (ranked.find((e) => e.healthy) || ranked[0]).provider
	}

	// best available — ws first (fastest for watching), else healthy http
	getProvider() {
		return this.getWsProvider() || this.getHealthyProvider()
	}

	// all live providers — for multi-rpc broadcast / broadcast အတွက်
	getAllProviders() {
		const list = this.http.filter((e) => e.healthy).map((e) => e.provider)
		const wsp = this.getWsProvider()
		if (wsp) list.unshift(wsp)
		return list
	}

	// timeout-wrapped provider call / call ကို timeout နဲ့ထုပ်
	call(provider, method, ...args) {
		return withTimeout(provider[method](...args), this.timeoutMs, method)
	}

	destroy() {
		if (this.ws) this.ws.destroy()
	}
}

// single shared instance / တစ်ခုတည်းသုံး instance
module.exports = new RpcManager()
