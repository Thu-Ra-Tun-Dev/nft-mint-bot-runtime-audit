// DetectorRegistry — pluggable mint detectors (add/remove without touching pipeline)
// detector တွေကို registry ထဲ ထည့်/ထုတ်လို့ရ၊ pipeline ကို မထိ

class DetectorRegistry {
	constructor() {
		this.detectors = []
	}

	// register one detector: { id, kind, detect(candidate, analysis) -> match|null }
	register(detector) {
		this.detectors.push(detector)
		return this
	}

	list() { return this.detectors }
}

module.exports = { DetectorRegistry }
