// DetectorPipeline — run every detector over every candidate, score the matches
// detector အားလုံးကို candidate အားလုံးပေါ်မှာ run ပြီး match တွေ score

const { DetectorRegistry } = require("./detectorRegistry")
const { BUILTIN, nameMatches, inferPhase } = require("./builtinDetectors")
const { detectCustom } = require("./customMintDetector")
const { detectFallback } = require("./fallbackDetector")
const { scoreMatch } = require("./strategyScorer")

// build registry from builtin detectors / builtin detector တွေ register
function buildRegistry() {
	const reg = new DetectorRegistry()
	for (const d of BUILTIN) {
		reg.register({
			id: d.id,
			kind: d.kind,
			detect: (candidate) => {
				const structuralMatched = !!d.structural(candidate)
				const nameMatched = nameMatches(candidate.name, d.nameRe)
				if (!structuralMatched && !nameMatched) return null // no signal
				return {
					id: d.id,
					kind: d.kind,
					phase: inferPhase(candidate.requires),
					candidate,
					nameMatched,
					structuralMatched,
				}
			},
		})
	}
	return reg
}

// reasons list for explainability / ဘာကြောင့်ရွေးလဲ မှတ်တမ်း
function buildReasons(m) {
	const r = []
	if (m.nameMatched) r.push(`name~${m.kind}`)
	if (m.structuralMatched) r.push("structural")
	const q = m.candidate.requires
	if (q.proof) r.push("merkle-proof")
	if (q.signature) r.push("signature")
	if (m.candidate.payable) r.push("payable")
	if (q.qty) r.push("quantity-arg")
	return r
}

// finalize a raw match -> scored strategy entry / confidence တွက်ထည့်
function finalize(m, eventEvidence) {
	const q = m.candidate.requires
	const phaseCoherent =
		(m.phase === "wl" && q.proof) ||
		(m.phase === "gtd" && q.signature) ||
		(m.phase === "public" && m.candidate.payable)
	return {
		kind: m.kind,
		phase: m.phase,
		selector: m.candidate.selector,
		signature: m.candidate.signature,
		name: m.candidate.name,
		payable: !!m.candidate.payable,
		requires: q,
		reasons: buildReasons(m),
		fallback: !!m.fallback,
		confidence: scoreMatch({ candidate: m.candidate, nameMatched: m.nameMatched, phaseCoherent, eventEvidence }),
	}
}

function runPipeline(analysis, registry) {
	const eventEvidence = (analysis.events || []).some((e) => e.name === "Transfer" && e.seen)
	const candidates = analysis.mintCandidates || []
	const matches = []

	for (const candidate of candidates) {
		let matchedAny = false
		for (const det of registry.list()) {
			const m = det.detect(candidate, analysis)
			if (!m) continue
			matchedAny = true
			matches.push(finalize(m, eventEvidence))
		}
		// custom detection when no named detector fired / custom (per-candidate)
		if (!matchedAny) {
			const c = detectCustom(candidate)
			if (c) matches.push(finalize(c, eventEvidence))
		}
	}
	return matches
}

module.exports = { buildRegistry, runPipeline, finalize, detectFallback }
