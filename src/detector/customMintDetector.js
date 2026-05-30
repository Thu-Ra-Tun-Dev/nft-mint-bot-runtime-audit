// CustomMintDetector — catch mint-like fns no named detector matched (custom mint)
// နာမည်နဲ့မကိုက်ပေမယ့် structure အရ mint ပုံစံ fn တွေဖမ်း

const { inferPhase } = require("./builtinDetectors")

function detectCustom(candidate) {
	const r = candidate.requires
	// structural mint signature: proof OR signature OR (payable + qty)
	const looksMint = r.proof || r.signature || (candidate.payable && r.qty)
	if (!looksMint) return null
	return {
		id: "custom",
		kind: "custom",
		phase: inferPhase(r),
		candidate,
		nameMatched: false,
		structuralMatched: true,
	}
}

module.exports = { detectCustom }
