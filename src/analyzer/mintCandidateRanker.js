// MintCandidateRanker — score & rank mint fns from structural evidence (dynamic)
// structural signal နဲ့ mint candidate အမှတ်ပေးပြီး အဆင့်လိုက်စီ

const logger = require("../logger/logger")

function scoreFn(fn, evidence) {
	if (!fn.writable) return 0          // view/pure can't mint
	const s = fn.signals
	let score = 0
	if (s.payable) score += 3           // mints usually take value
	if (s.hasQty) score += 2
	if (s.hasProof) score += 2          // allowlist mint
	if (s.hasSignature) score += 1.5    // signature mint
	if (s.hasRecipient) score += 1
	if (s.nameHint) score += 1.5        // soft hint only
	if (s.adminHint) score -= 4         // owner/admin fn, not a user mint
	if (evidence.transferFromZeroSeen) score += 1
	return score
}

function rankMintCandidates(classifiedFns, events = []) {
	// did a mint-style Transfer actually fire? / mint Transfer တွေ့ဖူးလား
	const evidence = { transferFromZeroSeen: events.some((e) => e.name === "Transfer" && e.seen) }

	const ranked = classifiedFns
		.map((fn) => ({
			selector: fn.selector,
			signature: fn.signature,
			name: fn.name,
			payable: !!fn.payable,
			requires: {
				qty: fn.signals.hasQty,
				proof: fn.signals.hasProof,
				signature: fn.signals.hasSignature,
				recipient: fn.signals.hasRecipient,
				value: !!fn.payable,
			},
			score: scoreFn(fn, evidence),
		}))
		.filter((c) => c.score > 0)
		.sort((a, b) => b.score - a.score)

	logger.debug(`[analyzer] ${ranked.length} mint candidate(s) ranked`)
	return ranked
}

module.exports = { rankMintCandidates, scoreFn }
