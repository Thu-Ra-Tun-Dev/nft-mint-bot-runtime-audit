// Nonce Manager — per-wallet nonce + serialized tx queue + duplicate guard
// wallet တခုချင်း nonce ထိန်း၊ queue နဲ့အစဉ်လိုက်ပို၊ ထပ်ပိုတာကာကွယ်

const logger = require("../logger/logger")

class NonceManager {
	constructor() {
		// state per address / address တခုချင်း state
		// { next, chain: Promise, inflight: Set<dedupeKey> }
		this.state = new Map()
	}

	_get(address) {
		const key = address.toLowerCase()
		if (!this.state.has(key)) {
			this.state.set(key, { next: null, chain: Promise.resolve(), inflight: new Set() })
		}
		return this.state.get(key)
	}

	// sync nonce from chain (lazy or forced) / chain ကနေ nonce ယူ
	async sync(signer, force = false) {
		const s = this._get(signer.address)
		if (s.next === null || force) {
			s.next = await signer.getNonce("pending")
			logger.debug(`[nonce] synced ${signer.address} -> ${s.next}`)
		}
		return s.next
	}

	// reserve next nonce atomically / နောက် nonce တခုယူ
	async reserve(signer) {
		const s = this._get(signer.address)
		if (s.next === null) await this.sync(signer)
		return s.next++
	}

	// reset on gap/stuck error → next reserve re-syncs / error ဆို ပြန် sync
	reset(address) {
		this._get(address).next = null
	}

	// serialized enqueue per wallet — prevents nonce race
	// dedupeKey ပေးရင် ထပ်နေတဲ့ task ကို ကာကွယ်
	enqueue(address, task, dedupeKey) {
		const s = this._get(address)
		if (dedupeKey && s.inflight.has(dedupeKey)) {
			logger.warn(`[nonce] duplicate skipped: ${dedupeKey}`)
			return Promise.resolve({ duplicate: true })
		}
		if (dedupeKey) s.inflight.add(dedupeKey)

		// run after previous task / ယခင် task ပြီးမှဆက်လုပ်
		const run = s.chain.then(() => task())
		// keep queue alive even if a task throws / task error ဖြစ်လည်း queue မကျိုး
		s.chain = run.then(() => {}, () => {}).finally(() => {
			if (dedupeKey) s.inflight.delete(dedupeKey)
		})
		return run
	}
}

// single shared instance / တစ်ခုတည်းသုံး
module.exports = new NonceManager()
