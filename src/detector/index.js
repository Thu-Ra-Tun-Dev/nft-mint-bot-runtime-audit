// Detector entry — AnalysisResult -> MintStrategy (primary + alternates + confidence)
// AnalysisResult ကို MintStrategy ပြောင်း (primary + alternates + confidence)

const { buildRegistry, runPipeline, finalize, detectFallback } = require("./pipeline")
const logger = require("../logger/logger")

const registry = buildRegistry()

// one strategy per selector, keep the highest confidence / selector တစ်ခုစီ best
function dedupeBySelector(matches) {
	const best = new Map()
	for (const m of matches) {
		const prev = best.get(m.selector)
		if (!prev || m.confidence > prev.confidence) best.set(m.selector, m)
	}
	return [...best.values()].sort((a, b) => b.confidence - a.confidence)
}

function detectMintStrategy(analysis) {
	let matches = dedupeBySelector(runPipeline(analysis, registry))
	let source = "detector"

	// fallback path when nothing matched / ဘာမှမဖမ်းမိရင် fallback
	if (matches.length === 0) {
		const fb = detectFallback(analysis)
		if (fb) {
			const eventEvidence = (analysis.events || []).some((e) => e.name === "Transfer" && e.seen)
			const entry = finalize(fb, eventEvidence)
			entry.confidence = Number((entry.confidence * 0.5).toFixed(3)) // fallback = low trust
			entry.reasons = ["fallback", ...entry.reasons]
			matches = [entry]
			source = "fallback"
		}
	}

	if (matches.length === 0) {
		logger.warn(`[detector] no mint strategy for ${analysis.address}`)
		return { address: analysis.address, codeTarget: analysis.codeTarget, primary: null, alternates: [], source: "none" }
	}

	const [primary, ...alternates] = matches
	logger.info(`[detector] ${analysis.address} -> ${primary.kind}/${primary.phase} conf=${primary.confidence} (${source})`)
	return { address: analysis.address, codeTarget: analysis.codeTarget, primary, alternates, source }
}

module.exports = { detectMintStrategy, registry }
