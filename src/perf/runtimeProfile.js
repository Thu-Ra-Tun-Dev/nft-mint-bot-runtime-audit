// RuntimeProfile — detect host (Termux / low-end) and derive tunable perf limits
// host ကို detect (Termux / low-end) ပြီး performance tunable တွေ တွက်ထုတ်
// No project hardcode — env override + os metrics only / project hardcode မရှိ

const os = require("os")

// env number override with positive fallback / env number override
function envNum(key, fallback) {
	const n = Number(process.env[key])
	return Number.isFinite(n) && n > 0 ? n : fallback
}

// Termux / Android detection (string match, no regex) / Termux ဟုတ်မဟုတ်စစ်
function detectTermux() {
	const prefix = process.env.PREFIX || ""
	return (
		prefix.includes("com.termux") ||
		!!process.env.TERMUX_VERSION ||
		process.platform === "android"
	)
}

const totalMemMb = Math.round(os.totalmem() / (1024 * 1024))
const cpuCount = Math.max(1, (os.cpus() || []).length)
const isTermux = detectTermux()
// low-end = Termux OR <2GB RAM OR <=2 cores / low-end သတ်မှတ်
const lowEnd = isTermux || totalMemMb < 2048 || cpuCount <= 2

// interval scale — low-end မှာ poll နှေးပြီး CPU သက်သာ / poll interval scale
const intervalScale = envNum("PERF_INTERVAL_SCALE", lowEnd ? 1.5 : 1)

const profile = Object.freeze({
	isTermux,
	lowEnd,
	cpuCount,
	totalMemMb,
	// parallel task cap / parallel task ကန့်
	maxConcurrency: envNum("PERF_MAX_CONCURRENCY", lowEnd ? 3 : Math.min(8, cpuCount * 2)),
	// cache bounds / cache ကန့်သတ်
	cacheMaxEntries: envNum("PERF_CACHE_MAX", lowEnd ? 200 : 1000),
	cacheTtlMs: envNum("PERF_CACHE_TTL_MS", 60000),
	// dedup set bound (watcher seen-sets) / dedup set ကန့်
	maxSeen: envNum("PERF_MAX_SEEN", lowEnd ? 2000 : 8000),
	// heap soft limit — breach ဆို cleanup + GC / heap soft limit
	heapSoftLimitMb: envNum("PERF_HEAP_SOFT_MB", lowEnd ? 256 : 768),
	// memory sweep cadence / memory sweep interval
	memorySweepMs: envNum("PERF_MEM_SWEEP_MS", 30000),
	// cooperative batch size / batch size
	batchSize: envNum("PERF_BATCH_SIZE", lowEnd ? 8 : 32),
	intervalScale,
})

// scale a base interval by profile (CPU saver) / interval ကို scale
function scaleInterval(baseMs) {
	return Math.round(baseMs * profile.intervalScale)
}

module.exports = { profile, scaleInterval, detectTermux }
