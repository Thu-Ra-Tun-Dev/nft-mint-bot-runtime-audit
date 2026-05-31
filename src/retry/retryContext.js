// RetryContext — normalize AnalysisResult + MintStrategy + PhaseReport into one live context
// input သုံးခုကို retry loop သုံးဖို့ context တခုအဖြစ် ပေါင်းစည်း

const { getAddress, Interface, ZeroAddress } = require("ethers")
const { buildArgs } = require("../phase/simulationProbe")
const { buildGating } = require("../phase")
const { gateFromRequires, phaseToGate, PHASE } = require("../phase/phaseSignals")
const logger = require("../logger/logger")

// highest-confidence candidate whose gate matches the resolved phase / gate ကိုက်ဆုံး candidate
// pool = [primary, ...alternates] is already confidence-sorted (primary first)
function findGateMatch(strategy, requiredGate) {
  const pool = [strategy.primary, ...((strategy && strategy.alternates) || [])]
  for (const cand of pool) {
    if (!cand || !cand.signature) continue
    if (gateFromRequires(cand.requires || {}) === requiredGate) return cand
  }
  return null
}

// pick the strategy entry to attempt — phase-aware reconciliation / phase နဲ့ ညှိရွေး
// detector က "ဘယ်ဟာ mint ဆန်ဆုံး" ဖြေ၊ phase resolve ပြီးမှ "ဘယ် function ခေါ်ရမလဲ" ဖြေ
// strictly additive: keep detector primary unless a phase-compatible alternate clearly applies
function selectPrimary(strategy, phaseReport = null) {
  if (!strategy || !strategy.primary) return null

  const activePhase = phaseReport && phaseReport.activePhase
  if (!activePhase) return strategy.primary // no phase info → keep primary

  const requiredGate = phaseToGate(activePhase)
  if (!requiredGate) return strategy.primary // ambiguous/unknown phase → keep primary

  const currentGate = gateFromRequires(strategy.primary.requires || {})
  if (currentGate === requiredGate) return strategy.primary // already compatible → no change

  // primary gate disagrees with the resolved phase → try a phase-compatible alternate
  // primary gate က phase နဲ့ မကိုက် → phase ကိုက်တဲ့ alternate ရှာ
  const match = findGateMatch(strategy, requiredGate)
  if (match && match.selector !== strategy.primary.selector) {
    logger.info(
      `[retry] phase-reselect ${strategy.primary.name}(${currentGate}) -> ${match.name}(${requiredGate}) for phase=${activePhase}`,
    )
    return match
  }

  // no phase-compatible candidate → fall back to detector primary / fallback
  logger.debug(`[retry] no ${requiredGate}-gate candidate for phase=${activePhase}, keeping ${strategy.primary.name}`)
  return strategy.primary
}

// recompute gating from the *chosen* primary so gate flags stay consistent / ရွေးပြီး primary အပေါ်က gating ပြန်တွက်
// keeps the txBuilder.checkGate path in sync with the executed function (live path ignores gating)
function gatingFor(phaseReport, primary) {
  if (!phaseReport || !phaseReport.activePhase) return {}
  const top = {
    phase: phaseReport.activePhase,
    stageIndex:
      phaseReport.candidates && phaseReport.candidates[0] ? phaseReport.candidates[0].stageIndex : undefined,
  }
  return buildGating(top, { primary })
}

// SeaDrop PUBLIC executes router.mintPublic(token, feeRecipient, minterIfNotPayer, qty);
// token-side candidates can't express it, so synthesize a router-targeted candidate.
// PUBLIC+SeaDrop ဆို router.mintPublic ကိုခေါ်ရ၊ token candidate က မဖော်နိုင်လို့ synthetic candidate ဆောက်
const SEADROP_MINT_PUBLIC_SIG = "mintPublic(address,address,address,uint256)"

function seaDropPublicOverride({ analysis, phaseReport, mintArgs }) {
  const sd = phaseReport && phaseReport.seaDrop

  console.log("[DEBUG] phase =", phaseReport?.activePhase)
  console.log("[DEBUG] seaDrop =", phaseReport?.seaDrop)
  console.log("[DEBUG] sd =", sd)

  if (!phaseReport || phaseReport.activePhase !== PHASE.PUBLIC || !sd) return null
  if (!sd.router || !sd.feeRecipient) return null // no router / no allowed recipient -> keep detector path

  const iface = new Interface([`function ${SEADROP_MINT_PUBLIC_SIG} payable`])
  const primary = {
    kind: "public",
    phase: "public",
    name: "mintPublic",
    signature: SEADROP_MINT_PUBLIC_SIG,
    selector: iface.getFunction("mintPublic").selector,
    payable: true,
    requires: { qty: true, recipient: true }, // gate = "none" / proof/sig မလို
    reasons: ["seadrop-router", "phase=public"],
  }

  // quantity: explicit single-element MINT_ARGS [n], else 1 / qty: MINT_ARGS [n] ရှိရင်ယူ မရှိရင် 1
  const qty = Array.isArray(mintArgs) && mintArgs.length === 1 ? BigInt(mintArgs[0]) : 1n
  // mintPublic(nftContract, feeRecipient, minterIfNotPayer=0x0(=payer), quantity)
  const args = [getAddress(sd.token || analysis.address), getAddress(sd.feeRecipient), ZeroAddress, qty]

  // value = mintPrice * quantity (overrides CLI value) / value = mintPrice*qty (CLI value override)
  let value = 0n
  try { value = BigInt(sd.mintPrice || 0n) * qty } catch (_) { value = 0n }

  console.log("[SEADROP OVERRIDE FIRED]")

  return { target: getAddress(sd.router), primary, iface, args, value }
}

// build a RetryContext from the three upstream reports / context ဆောက်
function buildRetryContext({ analysis, strategy, phaseReport, mintArgs = null, value = 0n } = {}) {
  if (!analysis || !analysis.address) throw new Error("[retry] missing AnalysisResult")
  const primary = selectPrimary(strategy, phaseReport)
  if (!primary || !primary.signature) throw new Error("[retry] no mint strategy to execute")

  // SeaDrop PUBLIC -> router mintPublic override (else keep detector primary on the token)
  // PUBLIC+SeaDrop ဆို router mintPublic သို့ override၊ မဟုတ်ရင် token primary အတိုင်း
  const sd = seaDropPublicOverride({ analysis, phaseReport, mintArgs })
  const chosen = sd ? sd.primary : primary

  const target = sd ? sd.target : getAddress(analysis.address) // proxy entrypoint (storage proxy ကိုခေါ်)
  const iface = sd ? sd.iface : new Interface([`function ${chosen.signature}`])

  // real args if provided, else dynamic placeholders (best-effort) / arg မပေးရင် placeholder
  const args = sd ? sd.args : (Array.isArray(mintArgs) ? mintArgs : buildArgs(chosen.signature))

  let valueWei = 0n
  try { valueWei = BigInt((sd ? sd.value : value) || 0n) } catch (_) { valueWei = 0n }

  console.log("[CTX TARGET]", target)
  console.log("[CTX PRIMARY]", chosen.name)
  console.log("[CTX VALUE]", valueWei.toString())
  console.log("[CTX ARGS]", args)

  const ctx = {
    target,
    phase: (phaseReport && phaseReport.activePhase) || "unknown",
    openConfidence: (phaseReport && phaseReport.confidence) || 0,
    gating: gatingFor(phaseReport, chosen),
    primary: chosen,
    alternates: (strategy && strategy.alternates) || [],
    iface,
    args,
    value: valueWei,
    source: (phaseReport && phaseReport.source) || "static",
    // SeaDrop live-window marker — only set when the router override fired (PUBLIC + live getPublicDrop)
    // statePhaseProbe live guard guarantees a currently-live window when this is non-null
    // override fire မှသာ set — statePhaseProbe guard ကြောင့် live window အာမခံ
    seaDrop: sd ? phaseReport.seaDrop : null,
    // encode calldata for current args / calldata ဆောက်
    encode() { return iface.encodeFunctionData(chosen.name, this.args) },
   }

  console.log("[CTX BUILT]")
  console.log("[CTX GATING]", ctx.gating)

  logger.debug(`[retry] context: ${chosen.name} phase=${ctx.phase} conf=${ctx.openConfidence}${sd ? " seadrop-router" : ""}`)
  return ctx
}

module.exports = { buildRetryContext, selectPrimary }
