// Phase Detector entry — AnalysisResult (+ MintStrategy) → PhaseReport
// pipeline ပေါင်းစည်း → PhaseReport (Execution Builder အတွက်)

const { inferStatic } = require("./staticInference")
const { probeState } = require("./statePhaseProbe")
const { probeSimulation } = require("./simulationProbe")
const { scorePhases } = require("./phaseScorer")
const { PHASE, gateFromRequires } = require("./phaseSignals")
const config = require("../config/settings")
const logger = require("../logger/logger")

// build gating summary from winning phase + strategy / gating အကျဉ်း
function buildGating(top, strategy) {
  const req = (strategy && strategy.primary && strategy.primary.requires) || {}
  return {
    needsProof: !!req.proof || top.phase === PHASE.WL || top.phase === PHASE.MERKLE,
    needsSignature: !!req.signature || top.phase === PHASE.SIGNATURE || top.phase === PHASE.GTD,
    needsHolderToken: top.phase === PHASE.HOLDER,
    payable: !!(strategy && strategy.primary && strategy.primary.payable),
    stageArg: top.stageIndex !== undefined ? top.stageIndex : null,
    gate: gateFromRequires(req),
  }
}

// detectPhase: simulation gated by feature toggle / simulate ကို toggle နဲ့
async function detectPhase(analysis, strategy = null, { from = null, simulate } = {}) {
  const doSim = simulate !== undefined ? simulate : config.features.simulateBeforeSend

  const staticHints = inferStatic(analysis)

  // live probes are best-effort — never block detection / live probe fail လည်းရ
  let stateHints = []
  try { stateHints = await probeState(analysis) } catch (e) { logger.debug(`[phase] state probe failed: ${e && e.message}`) }

  let simResults = []
  if (doSim) {
    try { simResults = await probeSimulation(analysis, from) } catch (e) { logger.debug(`[phase] simulation failed: ${e && e.message}`) }
  }

  const ranked = scorePhases({ staticHints, stateHints, simResults })

  if (ranked.length === 0) {
    logger.warn(`[phase] no phase evidence for ${analysis.address}`)
    return {
      address: analysis.address,
      activePhase: PHASE.UNKNOWN,
      candidates: [],
      gating: buildGating({ phase: PHASE.UNKNOWN }, strategy),
      source: "none",
      confidence: 0,
    }
  }

  const top = ranked[0]
  const source = simResults.length ? "simulation" : stateHints.length ? "state" : "static"
  const report = {
    address: analysis.address,
    activePhase: top.phase,
    candidates: ranked.map((r) => ({ phase: r.phase, confidence: r.confidence, reasons: r.reasons, stageIndex: r.stageIndex })),
    gating: buildGating(top, strategy),
    source,
    confidence: top.confidence,
  }

    // SeaDrop exec metadata is read straight from the raw winning state hint, because
    // phaseScorer + candidates projection drop non-allowlisted fields (mintPrice/feeRecipient)
    // SeaDrop metadata ကို raw winning state hint ကနေ တိုက်ရိုက်ယူ (scorer/candidates က ဖြတ်ထုတ်လို့)
    if (top.phase === PHASE.PUBLIC) {
      const seaHint = stateHints.find((h) => h && h.seaDrop && h.phase === PHASE.PUBLIC)
      if (seaHint) report.seaDrop = seaHint.seaDrop
    }

  logger.info(`[phase] ${analysis.address} → ${top.phase} conf=${top.confidence} (${source})`)
  return report
}

module.exports = { detectPhase, buildGating }
