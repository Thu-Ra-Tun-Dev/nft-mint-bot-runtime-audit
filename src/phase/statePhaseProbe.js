// StatePhaseProbe — discover phase-revealing view getters & read them live
// phase ဖော်ပြတဲ့ view getter တွေ dynamic ရှာပြီး live ဖတ် (နာမည် hardcode မရှိ)
//
// Plus an authoritative SeaDrop public-stage read: SeaDrop's getPublicDrop lives
// on the router (1-arg tuple), so the generic zero-arg getter loop can never reach it.
// SeaDrop getPublicDrop က router မှာ၊ arg တလုံးနဲ့ tuple ပြန်တာမို့ generic loop က မဖတ်နိုင်၊
// ဒါကြောင့် router ကို သီးသန့်ခေါ်ပြီး PUBLIC stage ကို တိုက်ရိုက်ဖတ်တယ်

const { Contract } = require("ethers")
const rpc = require("../rpc/rpcManager")
const { PHASE } = require("./phaseSignals")
const config = require("../config/settings")
const chains = require("../config/chains")
const logger = require("../logger/logger")

const RETURN_GUESSES = ["uint256", "bytes32", "bool"]

// token-side SeaDrop fingerprint — router fns (mintPublic/getPublicDrop) live off-token,
// so we recognise the token by the methods it DOES expose to forward into SeaDrop.
// token မှာ ရှိတဲ့ SeaDrop forwarding method တွေနဲ့ fingerprint လုပ်တယ်
const SEADROP_TOKEN_RE = /seadrop|publicdrop|mintstats|multiconfigure/i

// explicit PublicDrop tuple ABI — field order verified against ProjectOpenSea/seadrop SeaDropStructs.sol
// PublicDrop tuple ABI (field order ကို repo source နဲ့ တိုက်ပြီး အတည်ပြုထား)
const GET_PUBLIC_DROP_ABI = [
  "function getPublicDrop(address nftContract) view returns (uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients)",
]

// does this token look like a SeaDrop token? / SeaDrop token လား စစ်
function looksLikeSeaDrop(analysis) {
  return (analysis.selectors || []).some(
    (f) => f.resolved && SEADROP_TOKEN_RE.test(f.name || ""),
  )
}

// pick zero-arg view fns whose name looks phase-related / arg မလို view fn
function discoverGetters(analysis) {
  const re = /stage|phase|round|wave|tier|active|live|started|status|state|sale|config|merkle|root|public/i
  return (analysis.selectors || []).filter(
    (f) =>
      f.resolved &&
      ["view", "pure"].includes(f.stateMutability) &&
      (f.inputs || []).length === 0 &&
      re.test(f.name || ""),
  )
}

// try multiple return types until one decodes / return type မှန်းမှားရင် နောက်တခု
async function readGetter(target, provider, name) {
  for (const ret of RETURN_GUESSES) {
    try {
      const c = new Contract(target, [`function ${name}() view returns (${ret})`], provider)
      return await c[name]()
    } catch (_) {}
  }
  return undefined
}

// map a getter name+value → phase hint / getter value ကို phase hint
function valueToHint(name, value) {
  if (value === undefined) return null
  const n = name.toLowerCase()
  const isActive = value === true || (typeof value === "bigint" && value > 0n) || (typeof value === "number" && value > 0)

  if (/merkle|root/.test(n)) {
    // root may decode as hex string OR (read as uint256) a nonzero bigint / uint256 ဖြစ်လာရင်လည်းဖမ်း
    const hasRoot =
      (typeof value === "string" && /^0x[0-9a-f]+$/i.test(value) && !/^0x0+$/.test(value)) ||
      (typeof value === "bigint" && value !== 0n) ||
      (typeof value === "number" && value !== 0)
    return hasRoot ? { phase: PHASE.MERKLE, weight: 1.5, why: `${name}=set` } : null
  }
  if (/public/.test(n) && isActive) return { phase: PHASE.PUBLIC, weight: 2, why: `${name}=active` }
  if (/(stage|phase|round|wave|tier)/.test(n)) {
    const idx = Number(value)
    if (Number.isFinite(idx)) {
      const phase = idx <= 1 ? PHASE.PHASE1 : PHASE.PHASE2
      return { phase, weight: 1.5, why: `${name}=${idx}`, stageIndex: idx }
    }
  }
  if (/(active|live|started|status|state|sale)/.test(n) && isActive)
    return { phase: PHASE.PHASE1, weight: 0.8, why: `${name}=active` }
  return null
}

// authoritative SeaDrop PUBLIC read — only fires for SeaDrop tokens on a chain with a configured router
// SeaDrop token + router config ရှိမှသာ run၊ မဟုတ်ရင် null ပြန်ပြီး အရင် logic ကို မထိ
async function detectSeaDropPublic(analysis, provider) {
  console.log("[SEADROP] entered")
  if (!looksLikeSeaDrop(analysis)) return null
  const router = chains.getSeaDropRouter(config.chainId)
  console.log("[SEADROP] router =", router)
  if (!router) return null
  try {
    // getPublicDrop is on the ROUTER, parameterised by the token address (analysis.address)
    // getPublicDrop က router မှာ၊ token address ကို arg အဖြစ်ပေးရတယ်
    const sea = new Contract(router, GET_PUBLIC_DROP_ABI, provider)
    const drop = await sea.getPublicDrop(analysis.address)
    console.log("[SEADROP] drop =", drop)
    const start = BigInt(drop.startTime)
    const end = BigInt(drop.endTime)
    // all-zero struct = no public drop configured / public drop မ set ထားရင် zero
    if (start === 0n || end === 0n) return null
    const block = await provider.getBlock("latest")
    const now = BigInt(block.timestamp)
    console.log("[SEADROP] start =", start.toString())
    console.log("[SEADROP] end =", end.toString())
    console.log("[SEADROP] now =", now.toString())
    // only claim PUBLIC when the window is currently live / window ထဲ ရှိမှသာ PUBLIC
    if (now < start || now > end) return null
    return {
      phase: PHASE.PUBLIC,
      weight: 3,
      why: `seadrop getPublicDrop live [${start}-${end}] now=${now}`,
      stageIndex: 0,
      source: "state",
    }
  } catch (err) {
    console.log("[SEADROP] ERROR =", err?.message || err)
    // wrong router / not actually SeaDrop / revert → fall back to dynamic probe
    // ဘာမှားမှား → dynamic getter probe ဆီ ပြန်ကျ
    return null
  }
}

async function probeState(analysis) {
  // IMPORTANT: live view calls must hit the proxy (storage lives there), NOT the impl
  // proxy မှာ storage ရှိလို့ codeTarget(impl) မဟုတ်၊ analysis.address ကိုခေါ်
  const target = analysis.address
  const provider = rpc.getProvider()
  const hints = []

  // 1) authoritative SeaDrop public-stage read (router-side, parameterised)
  // SeaDrop PUBLIC ကို router ကနေ တိုက်ရိုက်ဖတ် — ရရင် strong hint
  const seaDropHint = await detectSeaDropPublic(analysis, provider)
  if (seaDropHint) hints.push(seaDropHint)

  // 2) existing dynamic zero-arg getter probe (unchanged) / အရင် dynamic getter probe (မပြောင်း)
  const getters = discoverGetters(analysis)
  for (const g of getters) {
    const val = await readGetter(target, provider, g.name)
    const hint = valueToHint(g.name, val)
    if (hint) hints.push({ ...hint, source: "state" })
  }

  logger.debug(`[phase] state probe: ${hints.length} hint(s) from ${getters.length} getter(s)${seaDropHint ? " +seadrop" : ""}`)
  return hints
}

module.exports = { probeState, discoverGetters, valueToHint, looksLikeSeaDrop, detectSeaDropPublic }
