// Selector-first classification — unit-style examples / selector-first စစ်ဆေးချက်
// node test/revertClassifier.selector.test.js နဲ့ runnable (framework မလို)

const assert = require("node:assert/strict")
const { classifyRevert } = require("../src/phase/revertClassifier")
const { selectorOf } = require("../src/phase/selectorRegistry")

// parsed builder — selector-first က text ရှိမရှိ မဆို အရင်စစ်တယ်
function parsed(sig, reason) {
	return { reason: reason || "", errorSelector: selectorOf(sig) }
}

// ── 1) NotActive → mint not live, saleOpen:false ──────────────────────────
assert.equal(selectorOf("NotActive(uint256,uint256,uint256)"), "0x13da22f2")
let r = classifyRevert(parsed("NotActive(uint256,uint256,uint256)"))
assert.equal(r.matched, true)
assert.equal(r.saleOpen, false)
assert.equal(r.gate, "none")
assert.equal(r.label, "NOT_LIVE")

// ── 2) InvalidProof → allowlist, saleOpen:true, gate:merkle ───────────────
assert.equal(selectorOf("InvalidProof()"), "0x09bde339")
r = classifyRevert(parsed("InvalidProof()"))
assert.equal(r.saleOpen, true)
assert.equal(r.gate, "merkle")
assert.equal(r.label, "ALLOWLIST")

// ── 3) InvalidSignature → signature, saleOpen:true, gate:signature ────────
assert.equal(selectorOf("InvalidSignature(address)"), "0xd855c4f4")
r = classifyRevert(parsed("InvalidSignature(address)"))
assert.equal(r.saleOpen, true)
assert.equal(r.gate, "signature")
assert.equal(r.label, "SIGNATURE")

// ── 4) IncorrectPayment → bad payment, saleOpen:true ──────────────────────
assert.equal(selectorOf("IncorrectPayment(uint256,uint256)"), "0x0d35e921")
r = classifyRevert(parsed("IncorrectPayment(uint256,uint256)"))
assert.equal(r.saleOpen, true)
assert.equal(r.gate, "none")
assert.equal(r.label, "BAD_PAYMENT")

// ── 5) MintQuantityExceedsMaxSupply → SOLD_OUT, saleOpen:false ────────────
//     selector-first က Rule 4 ("exceeds max" → open:true) ကို override လုပ်တာ
//     ပြဖို့ reason text ကို တမင်ထည့်ထား
r = classifyRevert(parsed("MintQuantityExceedsMaxSupply(uint256,uint256)", "execution reverted: exceeds max supply"))
assert.equal(r.matched, true)
assert.equal(r.saleOpen, false) // NOT true — selector seed wins over Rule 4
assert.equal(r.label, "SOLD_OUT")

// ── 6) MintQuantityExceedsMaxMintedPerWallet → WALLET_LIMIT, saleOpen:true ─
r = classifyRevert(parsed("MintQuantityExceedsMaxMintedPerWallet(uint256,uint256)"))
assert.equal(r.saleOpen, true) // sale live, this wallet just capped
assert.equal(r.gate, "none")
assert.equal(r.label, "WALLET_LIMIT")

// ── 7) FeeRecipientNotAllowed → FEE_GATE, saleOpen:true (was: no coverage) ─
r = classifyRevert(parsed("FeeRecipientNotAllowed()"))
assert.equal(r.matched, true)
assert.equal(r.saleOpen, true)
assert.equal(r.gate, "none")
assert.equal(r.label, "FEE_GATE")

// ── 8) OwnerQueryForNonexistentToken → NON_MINT, saleOpen:null ────────────
assert.equal(selectorOf("OwnerQueryForNonexistentToken()"), "0xdf2d9b42")
r = classifyRevert(parsed("OwnerQueryForNonexistentToken()"))
assert.equal(r.matched, true)
assert.equal(r.saleOpen, null) // not a sale-state signal
assert.equal(r.label, "NON_MINT")

// ── fallback proof: string reverts use RULES unchanged (no selector) ──────
// req 3 & 4: selector မပါရင် RULES & saleOpen logic အတိအတိုင်း
r = classifyRevert({ reason: "sale not active" })
assert.equal(r.saleOpen, false) // Rule 7 unchanged
assert.equal(r.label, undefined) // no seed label on the RULES path
r = classifyRevert({ reason: "exceeds max per wallet" })
assert.equal(r.saleOpen, true) // Rule 4 unchanged for string reverts

console.log("selectorRegistry classification: all examples passed")
