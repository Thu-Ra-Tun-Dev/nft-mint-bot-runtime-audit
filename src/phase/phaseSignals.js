// PhaseSignals — extended phase enum + soft signal extractors (no hardcode)
// phase အမျိုးအစား + soft signal ထုတ်စစ် (project hardcode မရှိ)

// extended phases beyond constants.MINT_PHASE / constants ထက်တိုးချဲ့ (prior file မပြင်)
const PHASE = Object.freeze({
  WL: "wl",
  GTD: "gtd",
  FCFS: "fcfs",
  PUBLIC: "public",
  HOLDER: "holder",
  SIGNATURE: "signature",
  MERKLE: "merkle",
  PHASE1: "phase1",
  PHASE2: "phase2",
  UNKNOWN: "unknown",
})

// regex hints — soft signals only / soft signal regex (authoritative မဟုတ်)
const HINTS = {
  allowlist: /allow[_ ]?list|presale|pre[_ ]?sale/i,
  whitelist: /white[_ ]?list/i,
  merkle: /merkle|proof|root/i,
  signature: /sig|signature|voucher|signer|recover/i,
  holder: /holder|hold|stake|balanceof|owns?/i,
  fcfs: /fcfs|first[_ ]?come|open[_ ]?edition/i,
  guaranteed: /gtd|guaranteed|guarantee/i,
  public: /public/i,
  stage: /stage|phase|round|wave|tier/i,
}

// extract soft hints from a name / နာမည်ထဲက hint
function nameSignals(name = "") {
  const out = {}
  for (const [k, re] of Object.entries(HINTS)) out[k] = re.test(name || "")
  return out
}

// arg-shape gate inference / arg shape ကနေ gate ခွဲ
function gateFromRequires(requires = {}) {
  if (requires.proof) return "merkle"
  if (requires.signature) return "signature"
  return "none"
}

// map a resolved active phase -> the calldata gate it requires / phase → လိုအပ်တဲ့ gate
// shares the same vocabulary as gateFromRequires: "merkle" | "signature" | "none"
// returns null when the phase is ambiguous, so the caller keeps the detector primary
// (HOLDER/PHASE1/PHASE2/UNKNOWN — gate မသေချာ၊ reselect မလုပ်)
function phaseToGate(phase) {
  switch (phase) {
    case PHASE.WL:
    case PHASE.MERKLE:
      return "merkle"
    case PHASE.GTD:
    case PHASE.SIGNATURE:
      return "signature"
    case PHASE.PUBLIC:
    case PHASE.FCFS:
      return "none"
    default:
      return null // ambiguous phase -> do not reselect / keep current primary
  }
}

module.exports = { PHASE, HINTS, nameSignals, gateFromRequires, phaseToGate }
