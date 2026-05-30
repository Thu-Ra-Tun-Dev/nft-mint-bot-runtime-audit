// FallbackInference — bytecode-only fallback + unknown contract (custom) inference
// verified ABI မရှိရင် bytecode selector fallback၊ မသိ contract ကို custom အဖြစ်ခန့်မှန်း

const { matchSelectors } = require("./selectorMatcher")

// confidence ceilings per path / path အလိုက် ceiling
const BYTECODE_CONFIDENCE_CAP = 0.7
const INFERENCE_CONFIDENCE_CAP = 0.5

// fallback platform guess from bytecode selectors only (no ABI) / bytecode-only guess
function fallbackDetect(analysis) {
	// selectors exist from P11 bytecode parsing even without ABI / ABI မရှိလည်း selector ရှိ
	const { candidates } = matchSelectors(analysis)
	const top = candidates.find((c) => c.meetsMin) || candidates[0] || null
	if (!top) return null
	return {
		platform: top.platform,
		confidence: Number(Math.min(top.score, BYTECODE_CONFIDENCE_CAP).toFixed(3)),
		matchSource: "bytecode",
		matchedSelectors: top.matchedSelectors,
		matchedEvents: top.matchedEvents,
		reasons: [`bytecode-fingerprint:${top.platform}`],
	}
}

// infer a synthetic "custom" platform from structural mint candidates (P11) / custom infer
function inferUnknown(analysis) {
	const candidates = (analysis.mintCandidates || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))
	const top = candidates[0]
	if (!top) {
		return { platform: "unknown", confidence: 0, matchSource: "inference", reasons: ["no-mint-candidate"], inferred: null }
	}

	// structural confidence from analyzer score (saturating, capped) / analyzer score -> 0..1
	const conf = Math.min(1 - Math.exp(-(top.score || 0) / 6), INFERENCE_CONFIDENCE_CAP)
	const r = top.requires || {}
	const reasons = ["structural-inference"]
	if (r.proof) reasons.push("merkle-proof-arg")
	if (r.signature) reasons.push("signature-arg")
	if (top.payable) reasons.push("payable")
	if (r.qty) reasons.push("quantity-arg")

	return {
		platform: "custom",
		confidence: Number(conf.toFixed(3)),
		matchSource: "inference",
		reasons,
		inferred: {
			likelyMintSelector: top.selector,
			signature: top.signature,
			name: top.name,
			requires: {
				qty: !!r.qty,
				proof: !!r.proof,
				signature: !!r.signature,
				recipient: !!r.recipient,
				value: !!top.payable,
			},
		},
	}
}

module.exports = { fallbackDetect, inferUnknown, BYTECODE_CONFIDENCE_CAP, INFERENCE_CONFIDENCE_CAP }
