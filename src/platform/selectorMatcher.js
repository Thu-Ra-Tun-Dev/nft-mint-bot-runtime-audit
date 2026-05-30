// SelectorMatcher — score a contract's selectors/events against the fingerprint DB
// contract ရဲ့ selector/event တွေကို fingerprint DB နဲ့ တိုက်ပြီး platform အမှတ်ပေး

const { FINGERPRINTS } = require("./fingerprintDB")

// normalized set of 4-byte selectors from AnalysisResult / selector set ဆောက်
function selectorSet(analysis) {
	const set = new Set()
	for (const s of analysis.selectors || []) {
		const sel = (typeof s === "string" ? s : s && s.selector) || ""
		if (sel) set.add(sel.toLowerCase())
	}
	return set
}

// normalized set of event topic0 hashes / event topic set
function topicSet(analysis) {
	const set = new Set()
	for (const e of analysis.events || []) {
		const t = (typeof e === "string" ? e : e && e.topic) || ""
		if (t) set.add(t.toLowerCase())
	}
	return set
}

// score one fingerprint against the contract sets / fingerprint တခုကို တိုက်
function scoreFingerprint(fp, selectors, topics) {
	let matchedWeight = 0
	let requiredMatched = 0
	let requiredTotal = 0
	const matchedSelectors = []
	const matchedEvents = []

	for (const fn of fp.functions) {
		if (fn.required) requiredTotal++
		if (selectors.has(fn.selector.toLowerCase())) {
			matchedWeight += fn.weight
			matchedSelectors.push(fn.selector)
			if (fn.required) requiredMatched++
		}
	}
	for (const ev of fp.events) {
		if (topics.has(ev.topic.toLowerCase())) {
			matchedWeight += ev.weight
			matchedEvents.push(ev.topic)
		}
	}

	// normalized score 0..1 against the fingerprint's own max weight / 0..1 normalize
	const score = fp.maxWeight > 0 ? matchedWeight / fp.maxWeight : 0
	// required gate: at least one required selector must hit (when any required defined)
	// required selector တခုမှ မကိုက်ရင် ယုံကြည်မှုနိမ့် (required သတ်မှတ်ထားရင်)
	const requiredOk = requiredTotal === 0 || requiredMatched > 0

	return {
		platform: fp.platform,
		label: fp.label,
		rawWeight: matchedWeight,
		score: Number(score.toFixed(4)),
		matchedSelectors,
		matchedEvents,
		requiredOk,
		requiredMatched,
		requiredTotal,
		meetsMin: matchedWeight >= fp.minScore && requiredOk,
		specificity: fp.specificity,
	}
}

// match contract against ALL fingerprints, ranked / fingerprint အားလုံးနဲ့တိုက်၊ စီ
function matchSelectors(analysis) {
	const selectors = selectorSet(analysis)
	const topics = topicSet(analysis)

	const candidates = FINGERPRINTS.map((fp) => scoreFingerprint(fp, selectors, topics))
		.filter((r) => r.rawWeight > 0) // keep only those with at least one hit / တခုခုကိုက်မှ
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.specificity - a.specificity || // tie -> more specific platform / တူရင် specific
				b.matchedSelectors.length - a.matchedSelectors.length,
		)

	return { selectorCount: selectors.size, eventCount: topics.size, candidates }
}

module.exports = { matchSelectors, scoreFingerprint, selectorSet, topicSet }
