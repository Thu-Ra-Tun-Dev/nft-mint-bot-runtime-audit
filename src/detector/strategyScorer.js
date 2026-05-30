// StrategyScorer — combine structural + name + event signals into 0..1 confidence
// structural + name + event signal တွေ ပေါင်းပြီး confidence (0..1)

// saturating curve: raw additive score -> 0..1 / raw ကို 0..1 အောင်
function squash(raw) {
	if (raw <= 0) return 0
	return 1 - Math.exp(-raw / 5)
}

function scoreMatch({ candidate, nameMatched, phaseCoherent, eventEvidence }) {
	let raw = candidate.score || 0   // analyzer structural score
	if (nameMatched) raw += 2        // name hint agrees
	if (phaseCoherent) raw += 1.5    // arg shape matches inferred phase
	if (eventEvidence) raw += 1      // mint-style Transfer observed
	return Number(squash(raw).toFixed(3))
}

module.exports = { scoreMatch, squash }
