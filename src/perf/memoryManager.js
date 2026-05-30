// MemoryManager — heap sampling + cleanup registry + optional GC (low RAM, memory cleanup)
// heap ကို sample၊ cleanup hook တွေကို ထိန်း၊ GC ရှိရင်ခေါ် (RAM သက်သာအောင်)
// Single shared instance / တစ်ခုတည်းသုံး instance

const { profile } = require("./runtimeProfile")
const logger = require("../logger/logger")

const MB = 1024 * 1024

class MemoryManager {
	constructor() {
		// cleanup hooks: { name -> { prune(), clear() } } / cleanup hook များ
		this.hooks = new Map()
		this.timer = null
		this.lastSweepAt = 0
	}

	// register a cleanup hook (cache/set); prune=soft, clear=hard / hook မှတ်
	register(name, hook) {
		if (!name || !hook) return () => {}
		this.hooks.set(name, hook)
		return () => this.hooks.delete(name) // unregister fn / ပြန်ဖြုတ်
	}

	// memory snapshot in MB / memory snapshot
	stats() {
		const m = process.memoryUsage()
		return {
			rssMb: Math.round(m.rss / MB),
			heapUsedMb: Math.round(m.heapUsed / MB),
			heapTotalMb: Math.round(m.heapTotal / MB),
			externalMb: Math.round((m.external || 0) / MB),
		}
	}

	// soft sweep — prune expired entries everywhere / expired တွေဖယ်
	prune() {
		for (const [name, h] of this.hooks) {
			try { h.prune && h.prune() } catch (e) { logger.debug(`[perf] prune ${name}: ${e && e.message}`) }
		}
	}

	// hard sweep — clear all registered caches/sets / အကုန်ရှင်း
	clearAll() {
		for (const [name, h] of this.hooks) {
			try { h.clear && h.clear() } catch (e) { logger.debug(`[perf] clear ${name}: ${e && e.message}`) }
		}
	}

	// trigger V8 GC if exposed (node --expose-gc) / GC ရှိရင်ခေါ်
	gc() {
		if (typeof global.gc === "function") {
			try { global.gc(); return true } catch (_) {}
		}
		return false
	}

	// one sweep cycle: prune; if over soft limit -> clear + GC / sweep တကြိမ်
	sweep() {
		this.lastSweepAt = Date.now()
		this.prune()
		const s = this.stats()
		if (s.heapUsedMb >= profile.heapSoftLimitMb) {
			logger.warn(`[perf] heap ${s.heapUsedMb}MB >= soft ${profile.heapSoftLimitMb}MB; clearing caches`)
			this.clearAll()
			const collected = this.gc()
			logger.debug(`[perf] post-clear heap ${this.stats().heapUsedMb}MB gc=${collected}`)
		}
		return s
	}

	// start periodic sweeps (unref so it never blocks exit) / sweep စ
	start() {
		if (this.timer) return this
		this.timer = setInterval(() => this.sweep(), profile.memorySweepMs)
		if (this.timer.unref) this.timer.unref() // Termux exit မထိ / unref
		logger.info(`[perf] memory manager started (soft ${profile.heapSoftLimitMb}MB, every ${profile.memorySweepMs}ms)`)
		return this
	}

	stop() {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}
}

module.exports = new MemoryManager()
