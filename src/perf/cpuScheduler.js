// CpuScheduler — cooperative yielding, batching, throttle, jittered backoff (low CPU)
// event loop မပိတ်အောင် yield/batch၊ throttle + jitter backoff (CPU သက်သာအောင်)

const { profile, scaleInterval } = require("./runtimeProfile")

// yield to the event loop once / event loop ကို တချက် yield
function yieldToLoop() {
	return new Promise((resolve) => setImmediate(resolve))
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// process items in bounded batches, yielding between (no CPU hog) / batch လိုက်လုပ်
async function runBatched(items, worker, options = {}) {
	const batchSize = options.batchSize || profile.batchSize
	const results = []
	let i = 0
	for (const item of items) {
		results.push(await worker(item, i++))
		// yield each batch so ws/watcher breathe / batch ပြီးတိုင်း yield
		if (i % batchSize === 0) await yieldToLoop()
	}
	return results
}

// concurrency-limited map (low-end safe) / concurrency ကန့်သတ် map
async function mapLimit(items, worker, limit = profile.maxConcurrency) {
	const arr = Array.from(items)
	const results = new Array(arr.length)
	let next = 0
	async function runner() {
		while (next < arr.length) {
			const idx = next++
			results[idx] = await worker(arr[idx], idx)
		}
	}
	const pool = Array.from({ length: Math.min(limit, arr.length) }, runner)
	await Promise.all(pool)
	return results
}

// jittered exponential backoff delay (ws reconnect / fast retry reuse) / jitter backoff
function backoffDelay(attempt, options = {}) {
	const baseMs = options.baseMs || 100
	const maxMs = options.maxMs || 2000
	const jitterMs = options.jitterMs === undefined ? 50 : options.jitterMs
	const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt))
	const jitter = Math.floor(Math.random() * (jitterMs + 1))
	return exp + jitter
}

// throttle — min interval between calls (scaled on low-end) / throttle
function throttle(fn, minIntervalMs) {
	const wait = scaleInterval(minIntervalMs)
	let last = 0
	let pending = null
	return (...args) => {
		const now = Date.now()
		if (now - last >= wait) {
			last = now
			return fn(...args)
		}
		// coalesce trailing call / နောက်ဆုံး call ကို coalesce
		if (!pending) {
			pending = setTimeout(() => {
				last = Date.now()
				pending = null
				fn(...args)
			}, wait - (now - last))
			if (pending.unref) pending.unref()
		}
	}
}

module.exports = { yieldToLoop, sleep, runBatched, mapLimit, backoffDelay, throttle }
