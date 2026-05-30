// RevertClassifier — map a parsed revert → phase signal class (regex, no hardcode)
// revert reason ကို phase class အဖြစ်ခွဲ (regex သာ၊ project hardcode မရှိ)

const { PHASE } = require("./phaseSignals")

// ordered rules — first match wins / အပေါ်ကစီ၊ ပထမတွေ့တာယူ
const RULES = [
	{ re: /invalid\s*proof|not\s*(allow|white)\s*list|merkle/i, phase: PHASE.WL, gate: "merkle", open: true },
	{ re: /invalid\s*sig|bad\s*sig|signature|unauthor|signer|expired/i, phase: PHASE.SIGNATURE, gate: "signature", open: true },
	{ re: /exceeds?\s*guaranteed|guarantee/i, phase: PHASE.GTD, gate: "merkle", open: true },
	{ re: /exceeds?\s*max|max\s*per|sold\s*out|limit|allocat/i, phase: PHASE.FCFS, gate: "none", open: true },
	{ re: /must\s*hold|holder|not\s*a?\s*holder|\bown(s|er)?\b/i, phase: PHASE.HOLDER, gate: "holder", open: true },
	{ re: /wrong\s*stage|invalid\s*stage|stage|phase|round|wave/i, phase: PHASE.PHASE1, gate: "none", open: true },
	{ re: /not\s*(active|started|live|open)|paused|closed|sale\s*not/i, phase: PHASE.UNKNOWN, gate: "none", open: false },
	{ re: /insufficient|incorrect\s*(value|price|payment|eth)|wrong\s*price/i, phase: PHASE.PUBLIC, gate: "none", open: true },
]

// classify a parsed revert / parseRevert ရဲ့ output ကိုခွဲ
function classifyRevert(parsed) {
	const text = (parsed && parsed.reason) || ""
	for (const rule of RULES) {
		if (text && rule.re.test(text)) {
			return { matched: true, phase: rule.phase, gate: rule.gate, saleOpen: rule.open, text }
		}
	}
	// custom error selector, no text → weak unknown signal / custom error
	if (parsed && parsed.errorSelector && !text) {
		return { matched: false, phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, errorSelector: parsed.errorSelector }
	}
	return { matched: false, phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, text }
}

module.exports = { classifyRevert, RULES }
