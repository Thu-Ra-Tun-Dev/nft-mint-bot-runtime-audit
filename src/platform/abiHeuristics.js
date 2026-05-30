// AbiHeuristics — refine platform scores using verified-ABI name/shape signals (soft)
// verified ABI ရှိမှ၊ function name/shape အရ platform score ကို refine (soft signal)

// platform-leaning markers — GENERIC standard interface names, never collection-specific
// platform သို့ယိမ်းတဲ့ name/getter marker — standard interface သာ
const RULES = [
  { platform: "seadrop", re: /seadrop|publicdrop|allowlistmint|mintseadrop/i, delta: 1.5 },
  { platform: "thirdweb", re: /claimcondition|getactiveclaimconditionid|verifyclaim|lazymint/i, delta: 1.5 },
  { platform: "manifold", re: /extension|mintbase|mintextension|creatorcore/i, delta: 1.5 },
  { platform: "zora", re: /zorafee|saledetails|purchasepresale|mintwithrewards/i, delta: 1.5 },
  { platform: "erc721a", re: /numberminted|explicitownership|tokensofowner|consecutivetransfer/i, delta: 1.2 },
  { platform: "opensea", re: /fulfill(basic)?order|operatorfilter|seaport/i, delta: 1.2 },
]

// collect function + event names from AnalysisResult / ABI ထဲက name စုစည်း
function namesFrom(analysis) {
  const names = []
  for (const s of analysis.selectors || []) {
    if (s && s.resolved && s.name) names.push(s.name)
  }
  for (const e of analysis.events || []) {
    if (e && e.name) names.push(e.name)
  }
  return names
}

// per-platform score deltas (only when ABI verified) / platform delta ထုတ်
function abiHeuristics(analysis) {
  // no verified ABI -> no name evidence / verified ABI မရှိရင် empty
  // accept verified + verified-proxy-impl identically / proxy-impl ကိုပါ verified လို သဘောထား
  if (!analysis || (analysis.abiSource !== "verified" && analysis.abiSource !== "verified-proxy-impl")) {
    return { applied: false, deltas: {}, reasons: {} }
  }

  const names = namesFrom(analysis)
  const blob = names.join(" ")
  const deltas = {}
  const reasons = {}

  for (const rule of RULES) {
    if (rule.re.test(blob)) {
      deltas[rule.platform] = (deltas[rule.platform] || 0) + rule.delta
      ;(reasons[rule.platform] = reasons[rule.platform] || []).push(`abi~${rule.platform}`)
    }
  }

  return { applied: true, deltas, reasons }
}

module.exports = { abiHeuristics, namesFrom, RULES }
