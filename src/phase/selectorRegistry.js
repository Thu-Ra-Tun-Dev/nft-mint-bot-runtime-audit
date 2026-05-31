// SelectorRegistry — canonical custom-error seed (SeaDrop + ERC721A)
// canonical custom-error seed (SeaDrop + ERC721A) — selector ကို runtime မှာ
// ethers id() နဲ့ တွက်တယ်၊ hardcode မရှိ။ 4byte/openchain မှာ မရှိတဲ့ SeaDrop
// bespoke errors တွေကိုပါ keccak256 ကနေ build-time တွက်လို့ ကွက်လပ်မဖြစ်ဘူး။

const { id } = require("ethers")
const { PHASE } = require("./phaseSignals")

// canonical signature seed / canonical signature seed
// saleOpen: true = sale live (gated) · false = not mintable (terminal) · null = not a sale signal
const SEED = [
	// ── SeaDrop · mint-path ───────────────────────────────────────────────
	{ sig: "NotActive(uint256,uint256,uint256)", phase: PHASE.UNKNOWN, gate: "none", saleOpen: false, label: "NOT_LIVE" },
	{ sig: "MintQuantityExceedsMaxSupply(uint256,uint256)", phase: PHASE.UNKNOWN, gate: "none", saleOpen: false, label: "SOLD_OUT" },
	{ sig: "MintQuantityExceedsMaxTokenSupplyForStage(uint256,uint256)", phase: PHASE.UNKNOWN, gate: "none", saleOpen: false, label: "SOLD_OUT_STAGE" },
	{ sig: "MintQuantityExceedsMaxMintedPerWallet(uint256,uint256)", phase: PHASE.FCFS, gate: "none", saleOpen: true, label: "WALLET_LIMIT" },
	{ sig: "MintQuantityCannotBeZero()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "BAD_INPUT" },
	{ sig: "IncorrectPayment(uint256,uint256)", phase: PHASE.PUBLIC, gate: "none", saleOpen: true, label: "BAD_PAYMENT" },
	{ sig: "InvalidProof()", phase: PHASE.WL, gate: "merkle", saleOpen: true, label: "ALLOWLIST" },
	{ sig: "InvalidSignature(address)", phase: PHASE.SIGNATURE, gate: "signature", saleOpen: true, label: "SIGNATURE" },
	{ sig: "SignatureAlreadyUsed()", phase: PHASE.SIGNATURE, gate: "signature", saleOpen: true, label: "SIGNATURE" },
	{ sig: "FeeRecipientNotAllowed()", phase: PHASE.PUBLIC, gate: "none", saleOpen: true, label: "FEE_GATE" },
	{ sig: "PayerNotAllowed()", phase: PHASE.PUBLIC, gate: "none", saleOpen: true, label: "PAYER_GATE" },
	{ sig: "TokenGatedNotTokenOwner(address,address,uint256)", phase: PHASE.HOLDER, gate: "holder", saleOpen: true, label: "TOKEN_GATED" },
	{ sig: "TokenGatedTokenIdAlreadyRedeemed(address,address,uint256)", phase: PHASE.HOLDER, gate: "holder", saleOpen: true, label: "TOKEN_GATED_USED" },
	{ sig: "OnlyINonFungibleSeaDropToken(address)", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	// ── SeaDrop · admin / config (mint path မှာ မဖြစ်နိုင်) ─────────────────
	{ sig: "FeeRecipientCannotBeZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	{ sig: "FeeRecipientNotPresent()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	{ sig: "CreatorPayoutAddressCannotBeZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	{ sig: "SignerCannotBeZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	{ sig: "SignerNotPresent()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	{ sig: "PayerNotPresent()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "ADMIN" },
	// ── ERC721A custom errors (NON_MINT / BAD_INPUT) ──────────────────────
	{ sig: "OwnerQueryForNonexistentToken()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "ApprovalCallerNotOwnerNorApproved()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "ApprovalQueryForNonexistentToken()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "BalanceQueryForZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "MintToZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "BAD_INPUT" },
	{ sig: "MintZeroQuantity()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "BAD_INPUT" },
	{ sig: "MintERC2309QuantityExceedsLimit()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "OwnershipNotInitializedForExtraData()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "TransferCallerNotOwnerNorApproved()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "TransferFromIncorrectOwner()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "TransferToNonERC721ReceiverImplementer()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "TransferToZeroAddress()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
	{ sig: "URIQueryForNonexistentToken()", phase: PHASE.UNKNOWN, gate: "none", saleOpen: null, label: "NON_MINT" },
]

// 4-byte selector of an error signature / error signature ရဲ့ 4-byte selector
function selectorOf(sig) {
	return id(sig).slice(0, 10).toLowerCase()
}

// build selector → entry map at load / load ချိန်မှာ selector → entry map ဆောက်
const REGISTRY = new Map()
for (const e of SEED) {
	REGISTRY.set(selectorOf(e.sig), {
		signature: e.sig,
		phase: e.phase,
		gate: e.gate,
		saleOpen: e.saleOpen,
		label: e.label,
	})
}

// hot-path lookup (sync) / hot-path lookup (sync)
function lookupSelector(selector) {
	if (!selector || typeof selector !== "string") return null
	return REGISTRY.get(selector.toLowerCase().slice(0, 10)) || null
}

module.exports = { lookupSelector, selectorOf, REGISTRY, SEED }
