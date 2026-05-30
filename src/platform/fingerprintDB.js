// FingerprintDB — data-driven platform interface fingerprints (no project/collection hardcode)
// platform family တခုချင်းအတွက် function/event signature fingerprint (project hardcode မရှိ)
// Signatures are GENERIC standard interfaces, never collection addresses.
// signature တွေက standard interface သာ၊ collection-specific မဟုတ်

const { id } = require("ethers")

// selector = first 4 bytes of keccak256(signature) / signature keccak256 ပထမ 4 byte
function selectorOf(signature) {
	return id(signature).slice(0, 10)
}

// event topic0 = full keccak256 of the event signature / event signature keccak256 အပြည့်
function topicOf(signature) {
	return id(signature)
}

// Raw platform definitions — pure data; add an entry to extend (no logic change).
// platform definition — data သက်သက်၊ entry ထည့်ရုံနဲ့ တိုးချဲ့ (logic မပြင်ရ)
const DEFINITIONS = [
	{
		platform: "seadrop",
		label: "OpenSea SeaDrop",
		functions: [
			{ sig: "mintPublic(address,address,address,uint256)", weight: 3, required: true },
			{ sig: "mintAllowList(address,address,address,uint256,(bytes32,bytes32[]))", weight: 2.5 },
			{ sig: "getPublicDrop(address)", weight: 1.5 },
		],
		events: [{ sig: "SeaDropMint(address,address,address,address,uint256,uint256,uint256,uint256,uint256)", weight: 2 }],
		minScore: 3,
		specificity: 5,
	},
	{
		platform: "thirdweb",
		label: "Thirdweb Drop",
		functions: [
			{ sig: "claim(address,uint256,address,uint256,(bytes32[],uint256,uint256,address),bytes)", weight: 3, required: true },
			{ sig: "getActiveClaimConditionId()", weight: 2 },
			{ sig: "verifyClaim(uint256,address,uint256,address,uint256,(bytes32[],uint256,uint256,address))", weight: 2 },
		],
		events: [{ sig: "TokensClaimed(uint256,address,address,uint256,uint256)", weight: 2 }],
		minScore: 3,
		specificity: 5,
	},
	{
		platform: "manifold",
		label: "Manifold Creator",
		functions: [
			{ sig: "mintExtension(address)", weight: 2.5, required: true },
			{ sig: "registerExtension(address,string)", weight: 2 },
			{ sig: "getExtensions()", weight: 1.5 },
		],
		events: [{ sig: "ExtensionRegistered(address,address)", weight: 2 }],
		minScore: 3,
		specificity: 4,
	},
	{
		platform: "zora",
		label: "Zora Drops",
		functions: [
			{ sig: "purchase(uint256)", weight: 2.5, required: true },
			{ sig: "purchasePresale(uint256,uint256,uint256,bytes32[])", weight: 2.5 },
			{ sig: "zoraFeeForAmount(uint256)", weight: 2 },
		],
		events: [{ sig: "Sale(address,uint256,uint256,uint256)", weight: 1.5 }],
		minScore: 3,
		specificity: 4,
	},
	{
		platform: "erc721a",
		label: "ERC721A",
		functions: [
			{ sig: "numberMinted(address)", weight: 2, required: true },
			{ sig: "explicitOwnershipOf(uint256)", weight: 2 },
			{ sig: "tokensOfOwner(address)", weight: 1.5 },
		],
		events: [{ sig: "ConsecutiveTransfer(uint256,uint256,address,address)", weight: 2 }],
		minScore: 2.5,
		specificity: 2,
	},
	{
		platform: "opensea",
		label: "OpenSea Seaport",
		functions: [
			{ sig: "fulfillBasicOrder((address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,(uint256,address)[],bytes))", weight: 2.5, required: true },
			{ sig: "operatorFilterRegistry()", weight: 1.5 },
		],
		events: [{ sig: "OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])", weight: 1.5 }],
		minScore: 2.5,
		specificity: 3,
	},
]

// Precompute selectors & topics ONCE at load, then freeze. / load မှာ တကြိမ်တွက်ပြီး freeze
function compile(def) {
	const functions = def.functions.map((f) => ({
		signature: f.sig,
		selector: selectorOf(f.sig),
		weight: f.weight,
		required: !!f.required,
	}))
	const events = (def.events || []).map((e) => ({
		signature: e.sig,
		topic: topicOf(e.sig),
		weight: e.weight,
	}))
	// required weight (gate) + max weight (normalize) / required + max weight တွက်
	const requiredWeight = functions.filter((f) => f.required).reduce((s, f) => s + f.weight, 0) || 1
	const maxWeight =
		functions.reduce((s, f) => s + f.weight, 0) + events.reduce((s, e) => s + e.weight, 0)
	return Object.freeze({
		platform: def.platform,
		label: def.label,
		functions: Object.freeze(functions),
		events: Object.freeze(events),
		requiredWeight,
		maxWeight,
		minScore: def.minScore,
		specificity: def.specificity,
	})
}

const FINGERPRINTS = Object.freeze(DEFINITIONS.map(compile))

// quick lookup by platform key / platform key နဲ့ ရှာ
const BY_PLATFORM = Object.freeze(
	FINGERPRINTS.reduce((acc, fp) => {
		acc[fp.platform] = fp
		return acc
	}, {}),
)

module.exports = { FINGERPRINTS, BY_PLATFORM, selectorOf, topicOf }
