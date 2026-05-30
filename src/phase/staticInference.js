// StaticInference — phase candidates from ABI/selectors/events (no chain call)
// ABI/selector/event ကနေ phase candidate ခန့်မှန်း (chain call မလို)

const { PHASE, nameSignals } = require("./phaseSignals")

// derive phase hints from one mint candidate's shape / candidate တခုကနေ
function phasesFromCandidate(candidate) {
	const r = candidate.requires || {}
	const n = nameSignals(candidate.name)
	const out = []

	if (r.proof) {
		out.push({ phase: PHASE.MERKLE, weight: 2, why: "bytes32[] proof arg" })
		out.push({ phase: n.guaranteed ? PHASE.GTD : PHASE.WL, weight: 1.5, why: "proof-gated allowlist" })
		if (n.fcfs) out.push({ phase: PHASE.FCFS, weight: 1, why: "fcfs hint + proof" })
	}
	if (r.signature) out.push({ phase: PHASE.SIGNATURE, weight: 2, why: "bytes signature arg" })
	if (candidate.payable && r.qty && !r.proof && !r.signature)
		out.push({ phase: PHASE.PUBLIC, weight: 1.5, why: "payable qty, no gate" })

	// name-only soft hints / နာမည် soft hint
	if (n.holder) out.push({ phase: PHASE.HOLDER, weight: 1, why: "holder name hint" })
	if (n.fcfs) out.push({ phase: PHASE.FCFS, weight: 0.8, why: "fcfs name hint" })
	if (n.stage) out.push({ phase: PHASE.PHASE1, weight: 0.6, why: "stage/phase name hint" })
	if (n.guaranteed) out.push({ phase: PHASE.GTD, weight: 0.8, why: "guaranteed name hint" })

	return out
}

// event evidence → phase hints (seen events weigh more) / event ကနေ hint
function phasesFromEvents(events = []) {
	const out = []
	for (const e of events) {
		const nm = e.name || ""
		if (/merkle|root/i.test(nm)) out.push({ phase: PHASE.MERKLE, weight: e.seen ? 1.2 : 0.6, why: `event ${nm}` })
		if (/stage|phase|round|wave|saleconfig|config/i.test(nm))
			out.push({ phase: PHASE.PHASE1, weight: e.seen ? 1 : 0.5, why: `event ${nm}` })
		if (/sign|voucher/i.test(nm)) out.push({ phase: PHASE.SIGNATURE, weight: 0.6, why: `event ${nm}` })
	}
	return out
}

function inferStatic(analysis) {
	const hints = []
	for (const c of analysis.mintCandidates || []) hints.push(...phasesFromCandidate(c))
	hints.push(...phasesFromEvents(analysis.events || []))
	return hints // [{ phase, weight, why }]
}

module.exports = { inferStatic, phasesFromCandidate, phasesFromEvents }
