// FallbackDetector — last resort: highest-scored analyzer candidate
// ဘာ detector မှ မဖမ်းမိရင် analyzer score အမြင့်ဆုံး candidate ကိုယူ

function detectFallback(analysis) {
	const top = (analysis.mintCandidates || [])
		.slice()
		.sort((a, b) => b.score - a.score)[0]
	if (!top) return null
	return {
		id: "fallback",
		kind: "unknown",
		phase: top.requires && top.requires.proof ? "wl" : "public",
		candidate: top,
		nameMatched: false,
		structuralMatched: true,
		fallback: true,
	}
}

module.exports = { detectFallback }
