// Analyzer pipeline — address → normalized AnalysisResult (fully dynamic)
// address တခုကို အစအဆုံး dynamic analyze → AnalysisResult

const { getAddress } = require("ethers")
const config = require("../config/settings")
const logger = require("../logger/logger")
const { explorer } = require("../explorer")
const { loadBytecode } = require("./bytecodeLoader")
const { resolveProxy } = require("./proxyResolver")
const { resolveAbi } = require("./abiResolver")
const { parseSelectors } = require("./selectorParser")
const { analyzeSelectors } = require("./selectorAnalyzer")
const { scanEvents } = require("./eventScanner")
const { classifyFunctions } = require("./functionClassifier")
const { rankMintCandidates } = require("./mintCandidateRanker")

// abiSource values that represent a real verified ABI / verified-class abiSource
const VERIFIED_ABI_SOURCES = new Set(["verified", "verified-proxy-impl"])
function isVerifiedAbi(abiSource) {
  return VERIFIED_ABI_SOURCES.has(abiSource)
}

// verifiedAbi is optional, injected by caller (e.g. explorerService) when present
// chainId + useExplorer default from config → analyzeContract(addr) stays backward compatible
async function analyzeContract(
  address,
  {
    verifiedAbi = null,
    chainId = config.chainId,
    useExplorer = !!(config.explorer && config.explorer.enabled),
  } = {},
) {
  const addr = getAddress(address)

  // 1) runtime bytecode
  let { bytecode, isContract } = await loadBytecode(addr)
  if (!isContract) throw new Error(`[analyzer] ${addr} is not a contract`)

  // 2) proxy → analyze implementation code / proxy ဆို impl code ကိုသုံး
  const proxy = await resolveProxy(addr, bytecode)
  let codeTarget = addr
  if (proxy.isProxy && proxy.implementation) {
    codeTarget = proxy.implementation
    const impl = await loadBytecode(proxy.implementation)
    if (impl.isContract) bytecode = impl.bytecode
  }

  // 2b) optional: fetch a verified ABI from the explorer (graceful, never throws upward)
  // verifiedAbi မပါ + EXPLORER_ENABLED ဖွင့်ထားရင် explorer ကနေ ABI ဆွဲ
  let explorerSource = null
  if (!verifiedAbi && useExplorer) {
    const res = await explorer.fetchAbiWithProxy(codeTarget, chainId, {
      isProxy: proxy.isProxy,
      implementation: proxy.implementation || null,
    })
    if (res && res.abi && res.abi.length > 0) {
      verifiedAbi = res.abi
      explorerSource = res.source // "verified" | "verified-proxy-impl"
    }
  }

  // 3) ABI interface (verified if supplied)
  const { iface, source } = resolveAbi({ verifiedAbi })
  // explorer label wins when it supplied the ABI / explorer source ကို ဦးစားပေး
  const abiSource = verifiedAbi && explorerSource ? explorerSource : source

  // 4) selectors: parse → map
  const selectors = analyzeSelectors(parseSelectors(bytecode), iface)

  // 5) events + recent-log sampling
  const events = await scanEvents(addr, iface)

  // 6) classify + rank mint candidates
  const mintCandidates = rankMintCandidates(classifyFunctions(selectors), events)

  const result = {
    address: addr,
    isProxy: proxy.isProxy,
    implementation: proxy.implementation || null,
    codeTarget,
    abiSource,
    abiVerified: isVerifiedAbi(abiSource),
    selectors,
    events,
    mintCandidates,
  }
  logger.info(`[analyzer] ${addr} → ${mintCandidates.length} mint candidate(s), abi=${abiSource}`)
  return result
}

module.exports = { analyzeContract, isVerifiedAbi }
