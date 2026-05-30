// RetryContext — normalize AnalysisResult + MintStrategy + PhaseReport into one live context
// input သုံးခုကို retry loop သုံးဖို့ context တခုအဖြစ် ပေါင်းစည်း

const { getAddress, Interface } = require("ethers")
const { buildArgs } = require("../phase/simulationProbe")
const { buildGating } = require("../phase")
const { gateFromRequires, phaseToGate } = require("../phase/phaseSignals")
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

// build a RetryContext from the three upstream reports / context ဆောက်
function buildRetryContext({ analysis, strategy, phaseReport, mintArgs = null, value = 0n } = {}) {
  if (!analysis || !analysis.address) throw new Error("[retry] missing AnalysisResult")
  const primary = selectPrimary(strategy, phaseReport)
  if (!primary || !primary.signature) throw new Error("[retry] no mint strategy to execute")

  const target = getAddress(analysis.address) // proxy entrypoint (storage proxy ကိုခေါ်)
  const iface = new Interface([`function ${primary.signature}`])

  // real args if provided, else dynamic placeholders (best-effort) / arg မပေးရင် placeholder
  const args = Array.isArray(mintArgs) ? mintArgs : buildArgs(primary.signature)

  let valueWei = 0n
  try { valueWei = BigInt(value || 0n) } catch (_) { valueWei = 0n }

  const ctx = {
    target,
    phase: (phaseReport && phaseReport.activePhase) || "unknown",
    openConfidence: (phaseReport && phaseReport.confidence) || 0,
    gating: gatingFor(phaseReport, primary),
    primary,
    alternates: (strategy && strategy.alternates) || [],
    iface,
    args,
    value: valueWei,
    source: (phaseReport && phaseReport.source) || "static",
    // encode calldata for current args / calldata ဆောက်
    encode() { return iface.encodeFunctionData(primary.name, this.args) },
  }
  logger.debug(`[retry] context: ${primary.name} phase=${ctx.phase} conf=${ctx.openConfidence}`)
  return ctx
}

module.exports = { buildRetryContext, selectPrimary }
