// PhaseScorer — merge weighted evidence per phase, normalize to 0..1
// evidence အားလုံး phase အလိုက်ပေါင်း၊ 0..1 normalize

const { PHASE } = require("./phaseSignals")

// evidence-source priority multipliers / source priority
const SOURCE_WEIGHT = { simulation: 1.0, revert: 0.8, state: 0.7, event: 0.5, abiShape: 0.3 }

// add weighted hint into accumulator / hint တခုထည့်
function add(acc, phase, amount, reason, extra) {
	if (!acc[phase]) acc[phase] = { phase, raw: 0, reasons: [] }
	acc[phase].raw += amount
	if (reason) acc[phase].reasons.push(reason)
	if (extra && extra.stageIndex !== undefined) acc[phase].stageIndex = extra.stageIndex
}

// most-restrictive ordering for tie-break / တူရင် ပိုတင်းကျပ်တာဦးစား
const RESTRICTIVENESS = {
	[PHASE.SIGNATURE]: 6, [PHASE.GTD]: 5, [PHASE.MERKLE]: 4, [PHASE.WL]: 4,
	[PHASE.HOLDER]: 3, [PHASE.FCFS]: 2, [PHASE.PHASE2]: 2, [PHASE.PHASE1]: 1,
	[PHASE.PUBLIC]: 0, [PHASE.UNKNOWN]: -1,
}

// saturating curve raw → 0..1 / raw ကို 0..1
function squash(raw) {
	if (raw <= 0) return 0
	return Number((1 - Math.exp(-raw / 4)).toFixed(3))
}

function scorePhases({ staticHints = [], stateHints = [], simResults = [] }) {
	const acc = {}

	// static (abiShape + event) / static evidence (weakest)
	for (const h of staticHints) add(acc, h.phase, h.weight * SOURCE_WEIGHT.abiShape, h.why)
	// state probe / live state evidence
	for (const h of stateHints) add(acc, h.phase, h.weight * SOURCE_WEIGHT.state, h.why, { stageIndex: h.stageIndex })

	// simulation + revert classification (strongest) / sim + revert
	for (const r of simResults) {
		if (r.success) {
			// open path — infer phase from gate / gate ကနေ phase
			const phase = r.gate === "merkle" ? PHASE.WL : r.gate === "signature" ? PHASE.SIGNATURE : PHASE.PUBLIC
			add(acc, phase, 3 * SOURCE_WEIGHT.simulation, `sim ok (${r.selector})`)
		} else if (r.classification && r.classification.matched) {
			// closed sale weighs less than an open-but-gated revert / ပိတ်ထားရင် weight နည်း
			const w = (r.classification.saleOpen === false ? 1 : 2.5) * SOURCE_WEIGHT.revert
			add(acc, r.classification.phase, w, `revert:${r.classification.text || r.classification.gate}`)
		}
	}

	return Object.values(acc)
		.map((e) => ({ ...e, confidence: squash(e.raw) }))
		.sort((a, b) =>
			b.confidence - a.confidence ||
			(RESTRICTIVENESS[b.phase] || 0) - (RESTRICTIVENESS[a.phase] || 0),
		)
}

module.exports = { scorePhases, squash, SOURCE_WEIGHT }
