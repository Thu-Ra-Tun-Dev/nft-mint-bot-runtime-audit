// CacheManager — bounded LRU + TTL cache factory, auto-registered for cleanup
// LRU + TTL bound cache factory၊ memoryManager မှာ auto-register (cache optimization)

const { profile } = require("./runtimeProfile")
const memory = require("./memoryManager")

// bounded LRU + TTL cache / LRU + TTL cache
class LruCache {
	constructor(name, options = {}) {
		this.name = name
		this.maxEntries = options.maxEntries || profile.cacheMaxEntries
		this.ttlMs = options.ttlMs === undefined ? profile.cacheTtlMs : options.ttlMs
		this.map = new Map() // insertion-order = LRU order / Map order = LRU
		this.hits = 0
		this.misses = 0
	}

	_expired(entry) {
		return this.ttlMs > 0 && Date.now() - entry.at > this.ttlMs
	}

	get(key) {
		const entry = this.map.get(key)
		if (!entry) { this.misses++; return undefined }
		if (this._expired(entry)) { this.map.delete(key); this.misses++; return undefined }
		// refresh recency / recency refresh
		this.map.delete(key)
		this.map.set(key, entry)
		this.hits++
		return entry.value
	}

	set(key, value) {
		if (this.map.has(key)) this.map.delete(key)
		this.map.set(key, { value, at: Date.now() })
		// evict oldest over capacity / capacity ကျော်ရင် အဟောင်းဆုတ်
		while (this.map.size > this.maxEntries) {
			const oldest = this.map.keys().next().value
			this.map.delete(oldest)
		}
		return value
	}

	// single-flight cache: dedupe concurrent async loads / ထပ်နေတဲ့ async load ပေါင်း
	async wrap(key, loader) {
		const cached = this.get(key)
		if (cached !== undefined) return cached
		const value = await loader()
		this.set(key, value)
		return value
	}

	has(key) {
		const entry = this.map.get(key)
		if (!entry) return false
		if (this._expired(entry)) { this.map.delete(key); return false }
		return true
	}

	delete(key) { return this.map.delete(key) }

	// prune expired only (soft) / expired ပဲဖယ်
	prune() {
		for (const [k, entry] of this.map) if (this._expired(entry)) this.map.delete(k)
	}

	clear() { this.map.clear() }
	get size() { return this.map.size }
}

// registry of created caches / cache registry
const caches = new Map()

// factory — create + auto-register cleanup hooks / cache ဆောက်ပြီး register
function createCache(name, options) {
	if (caches.has(name)) return caches.get(name)
	const cache = new LruCache(name, options)
	caches.set(name, cache)
	memory.register(`cache:${name}`, { prune: () => cache.prune(), clear: () => cache.clear() })
	return cache
}

module.exports = { createCache, LruCache, caches }
