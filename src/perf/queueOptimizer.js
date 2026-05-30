// QueueOptimizer — concurrency-limited queue + single-flight coalescer (queue optimization)
// concurrency ကန့် queue + duplicate async call coalesce (queue optimize၊ RAM/CPU သက်သာ)

const { profile } = require("./runtimeProfile")
const memory = require("./memoryManager")

// concurrency-limited async queue / concurrency ကန့် queue
class ConcurrencyQueue {
	constructor(name, options = {}) {
		this.name = name
		this.concurrency = options.concurrency || profile.maxConcurrency
		this.active = 0
		this.queue = [] // [{ task, resolve, reject }]
	}

	// push a task -> promise / task ထည့်
	push(task) {
		return new Promise((resolve, reject) => {
			this.queue.push({ task, resolve, reject })
			this._drain()
		})
	}

	_drain() {
		while (this.active < this.concurrency && this.queue.length) {
			const { task, resolve, reject } = this.queue.shift()
			this.active++
			Promise.resolve()
				.then(task)
				.then(resolve, reject)
				.finally(() => {
					this.active--
					this._drain()
				})
		}
	}

	get pending() { return this.queue.length }
	clear() { this.queue.length = 0 } // drop pending (memory pressure) / pending ဖျက်
}

// single-flight — collapse concurrent identical calls into one / single-flight
class Coalescer {
	constructor(name) {
		this.name = name
		this.inflight = new Map() // key -> Promise
		memory.register(`coalescer:${name}`, { clear: () => this.inflight.clear() })
	}

	// run loader once per key while in flight / key တူရင် တကြိမ်ပဲ run
	run(key, loader) {
		if (this.inflight.has(key)) return this.inflight.get(key)
		const p = Promise.resolve()
			.then(loader)
			.finally(() => this.inflight.delete(key))
		this.inflight.set(key, p)
		return p
	}
}

module.exports = { ConcurrencyQueue, Coalescer }
