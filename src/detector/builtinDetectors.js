// Builtin detectors — generic mint verbs matched by STRUCTURE first, name = soft hint
// generic mint function တွေ — arg shape အရင်၊ နာမည်က soft hint သာ (project hardcode မရှိ)

const { MINT_PHASE } = require("../config/constants")

// loose name hint only (generic verbs, not collection-specific) / နာမည် soft hint
function nameMatches(name, re) {
	return re.test(name || "")
}

// phase inferred from argument shape, not from name / arg shape ကနေ phase ခွဲ
function inferPhase(requires) {
	if (requires.proof) return MINT_PHASE.WL        // merkle allowlist
	if (requires.signature) return MINT_PHASE.GTD   // signature gated
	return MINT_PHASE.PUBLIC
}

// id/kind + name hint + structural predicate / detector တစ်ခုချင်း
const BUILTIN = [
	{ id: "allowlistMint", kind: "allowlist", nameRe: /allow[_ ]?list|presale/i,     structural: (c) => c.requires.proof },
	{ id: "whitelistMint", kind: "whitelist", nameRe: /white[_ ]?list/i,            structural: (c) => c.requires.proof },
	{ id: "signatureMint", kind: "signature", nameRe: /sig|voucher/i,               structural: (c) => c.requires.signature && !c.requires.proof },
	{ id: "publicMint",    kind: "public",    nameRe: /public[_ ]?mint|publicsale/i, structural: (c) => c.payable && c.requires.qty && !c.requires.proof && !c.requires.signature },
	{ id: "purchase",      kind: "purchase",  nameRe: /purchase|order/i,            structural: (c) => c.payable && c.requires.qty },
	{ id: "buy",           kind: "buy",       nameRe: /buy/i,                        structural: (c) => c.payable && c.requires.qty },
	{ id: "claim",         kind: "claim",     nameRe: /claim/i,                      structural: (c) => !c.payable && c.requires.qty },
	{ id: "safeMint",      kind: "safeMint",  nameRe: /safe[_ ]?mint/i,              structural: (c) => c.requires.recipient && c.requires.qty },
	{ id: "mint",          kind: "mint",      nameRe: /(^|[^a-z])mint([^a-z]|$)/i,   structural: (c) => c.payable && c.requires.qty },
]

module.exports = { BUILTIN, nameMatches, inferPhase }
