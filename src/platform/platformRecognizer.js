// PlatformRecognizer — orchestrate selector + ABI + fallback + inference into one verdict
// selector match + ABI heuristic + fallback + inference ပေါင်းပြီး platform verdict တခုထုတ်

const { matchSelectors } = require("./selectorMatcher")
const { abiHeuristics } = require("./abiHeuristics")
const { fallbackDetect, inferUnknown } = require("./fallbackInference")
const logger = require("../logger/logger")

const VERIFIED_CONFIDENCE_CAP = 1.0

// merge ABI heuristic deltas into selector candidates, re-rank / ABI delta ပေါင်း
function applyAbiDeltas(candidates, abi) {
	if (!abi.applied) return candidates
	return candidates
		.map((c) => {
			const delta = abi.deltas[c.platform] || 0
			if (!delta) return c
			// additive on score, clamp to 0..1 / score ပေါ်ထည့်ပြီး 0..1 clamp
			const boosted = Math.min(c.score + delta / 10, VERIFIED_CONFIDENCE_CAP)
			return { ...c, score: Number(boosted.toFixed(4)), abiReasons: abi.reasons[c.platform] || [] }
		})
		.sort((a, b) => b.score - a.score || b.specificity - a.specificity)
}

// recognize platform for an AnalysisResult (P11) / AnalysisResult ကို platform ခွဲ
function recognizePlatform(analysis) {
	if (!analysis || !analysis.address) throw new Error("[platform] missing AnalysisResult")

	const verified = analysis.abiSource === "verified" || analysis.abiSource === "verified-proxy-impl"
	const { selectorCount, eventCount, candidates } = matchSelectors(analysis)
	const abi = abiHeuristics(analysis)
	const ranked = applyAbiDeltas(candidates, abi)
	const cap = verified ? VERIFIED_CONFIDENCE_CAP : 0.7
	const matchSource = abi.applied && Object.keys(abi.deltas).length ? "abi" : "selector"

	let verdict
	const top = ranked.find((c) => c.meetsMin) || ranked[0]

	if (top && top.score > 0 && (top.meetsMin || verified)) {
		// confident named-platform verdict / platform သေချာ
		verdict = {
			address: analysis.address,
			platform: top.platform,
			confidence: Number(Math.min(top.score, cap).toFixed(3)),
			matchSource: top.matchedEvents.length && !top.matchedSelectors.length ? "event" : matchSource,
			abiSource: verified ? "verified" : "bytecode",
			matchedSelectors: top.matchedSelectors,
			matchedEvents: top.matchedEvents,
			inferred: null,
		}
	} else if (!verified) {
		// no clear match + unverified -> bytecode fallback, else custom inference
		// match မရှိ + unverified -> bytecode fallback၊ မရရင် custom inference
		const fb = fallbackDetect(analysis)
		if (fb && fb.confidence > 0) {
			verdict = { address: analysis.address, ...fb, abiSource: "bytecode", inferred: null }
		} else {
			verdict = { address: analysis.address, ...inferUnknown(analysis), abiSource: "bytecode" }
		}
	} else {
		// verified ABI but no fingerprint -> low-confidence custom inference
		// verified ABI ပေမယ့် fingerprint မကိုက် -> custom inference
		verdict = { address: analysis.address, ...inferUnknown(analysis), abiSource: "verified" }
	}

	// attach ranked candidates for explainability / candidate list ပူးတွဲ
	verdict.candidates = ranked.slice(0, 5).map((c) => ({
		platform: c.platform,
		confidence: c.score,
		matchedCount: c.matchedSelectors.length + c.matchedEvents.length,
		reasons: [
			...(c.matchedSelectors.length ? [`${c.matchedSelectors.length} selector(s)`] : []),
			...(c.matchedEvents.length ? [`${c.matchedEvents.length} event(s)`] : []),
			...(c.abiReasons || []),
		],
	}))
	verdict.source = "platformRecognizer"
	verdict.scanned = { selectors: selectorCount, events: eventCount }

	logger.info(`[platform] ${analysis.address} -> ${verdict.platform} conf=${verdict.confidence} (${verdict.matchSource}, abi=${verdict.abiSource})`)
	return verdict
}

module.exports = { recognizePlatform, applyAbiDeltas }
