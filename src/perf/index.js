// Perf entry — single opt-in performance toolkit (auto-starts memory manager)
// performance toolkit တခုတည်း entry၊ memory manager auto-start (မော်းရင်သုံး)

const { profile, scaleInterval } = require("./runtimeProfile")
const memory = require("./memoryManager")
const cpu = require("./cpuScheduler")
const { createCache, LruCache } = require("./cacheManager")
const { ConcurrencyQueue, Coalescer } = require("./queueOptimizer")
const logger = require("../logger/logger")

// start global memory sweeps once on require / require တကြိမ် memory sweep စ
memory.start()
logger.info(`[perf] profile termux=${profile.isTermux} lowEnd=${profile.lowEnd} cpu=${profile.cpuCount} mem=${profile.totalMemMb}MB conc=${profile.maxConcurrency}`)

module.exports = {
	profile,
	scaleInterval,
	memory,
	cpu,
	cache: { createCache, LruCache },
	queue: { ConcurrencyQueue, Coalescer },
}
