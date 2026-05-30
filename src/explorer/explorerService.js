// ExplorerService — dynamic verified-ABI acquisition (Etherscan API V2, multichain)
// Policy: proxy → implementation ABI only (merge only if EXPLORER_MERGE_PROXY_ABI=true)
// failure အားလုံး NON-FATAL: caller က { abi: null, source: "none" } ပဲရ

const { FetchRequest, Interface, getAddress } = require("ethers")
const config = require("../config/settings")
const logger = require("../logger/logger")
const { resolveEndpoint } = require("./endpointRegistry")
const { createRateLimiter } = require("./rateLimiter")
const { createAbiCache } = require("./abiCache")
const { normalizeGetAbi, normalizeGetSource } = require("./responseNormalizer")
const { NotVerifiedError } = require("./errors")

const NONE = { abi: null, source: "none" }

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    if (typeof t.unref === "function") t.unref()
  })
}

function createExplorerService(opts = {}) {
  const cfg = (config && config.explorer) || {}
  const settings = {
    enabled: opts.enabled ?? cfg.enabled ?? false,
    timeoutMs: opts.timeoutMs ?? cfg.timeoutMs ?? 8000,
    maxRetries: opts.maxRetries ?? cfg.maxRetries ?? 3,
    rps: opts.rps ?? cfg.rps ?? 5,
    cacheDir: opts.cacheDir ?? cfg.cacheDir ?? ".cache/abi",
    negativeTtlMs: opts.negativeTtlMs ?? cfg.negativeTtlMs ?? 300000,
    mergeProxyAbi: opts.mergeProxyAbi ?? cfg.mergeProxyAbi ?? false,
  }

  const limiter = createRateLimiter({ rps: settings.rps })
  const cache = createAbiCache({ cacheDir: settings.cacheDir, negativeTtlMs: settings.negativeTtlMs })

  function normalizeAddr(a) {
    try {
      return getAddress(a)
    } catch (_) {
      return a
    }
  }

  async function httpGetJson(url) {
    const req = new FetchRequest(url)
    req.timeout = settings.timeoutMs
    req.setHeader("accept", "application/json")
    const resp = await req.send()
    if (!resp.statusCode || resp.statusCode < 200 || resp.statusCode >= 300) {
      const err = new Error(`HTTP ${resp.statusCode}`)
      err.statusCode = resp.statusCode
      throw err
    }
    return JSON.parse(resp.bodyText)
  }

  // V2 requires the chainid param alongside module/action/address / V2 မှာ chainid လို
  function buildUrl(endpoint, params) {
    const usp = new URLSearchParams(params)
    if (endpoint.chainParam != null) usp.set("chainid", String(endpoint.chainParam))
    if (endpoint.apiKey) usp.set("apikey", endpoint.apiKey)
    const sep = endpoint.baseUrl.includes("?") ? "&" : "?"
    return `${endpoint.baseUrl}${sep}${usp.toString()}`
  }

  // capped exponential backoff; never retry a definitive NotVerified / retry
  async function withRetry(fn) {
    let lastErr
    for (let attempt = 0; attempt <= settings.maxRetries; attempt++) {
      try {
        await limiter.acquire()
        return await fn()
      } catch (err) {
        lastErr = err
        if (err instanceof NotVerifiedError) throw err
        if (attempt === settings.maxRetries) break
        await sleep(Math.min(2000, 200 * 2 ** attempt))
      }
    }
    throw lastErr
  }

  async function fetchRawAbi(address, endpoint) {
    const url = buildUrl(endpoint, { module: "contract", action: "getabi", address })
    return normalizeGetAbi(await httpGetJson(url), address).abi
  }

  async function fetchSource(address, endpoint) {
    const url = buildUrl(endpoint, { module: "contract", action: "getsourcecode", address })
    return normalizeGetSource(await httpGetJson(url), address)
  }

  // dedupe fragments by stable JSON identity / fragment ထပ်တာ ဖယ်
  function mergeFragments(proxyAbi, implAbi) {
    const seen = new Set()
    const out = []
    for (const f of [...implAbi, ...proxyAbi]) {
      const sig = JSON.stringify(f)
      if (seen.has(sig)) continue
      seen.add(sig)
      out.push(f)
    }
    return out
  }

  async function handleFailure(chainId, addr, err) {
    if (err instanceof NotVerifiedError) {
      try {
        await cache.setNegative(chainId, addr)
      } catch (_) {}
      logger.info(`[explorer] ${addr} unverified on chain ${chainId}; continuing with no ABI`)
    } else {
      logger.warn(`[explorer] ABI fetch failed for ${addr} (chain ${chainId}): ${err.message}; continuing`)
    }
    return NONE
  }

  // single-address fetch, no proxy logic / address တခု ABI
  async function fetchAbi(address, chainId) {
    if (!settings.enabled) return NONE
    const addr = normalizeAddr(address)
    try {
      const cached = await cache.get(chainId, addr)
      if (cached) return cached.negative ? NONE : { abi: cached.abi, source: "verified", meta: cached.meta }
      const endpoint = resolveEndpoint(chainId)
      const abi = await withRetry(() => fetchRawAbi(addr, endpoint))
      await cache.setPositive(chainId, addr, abi, { source: "verified", via: "getabi" })
      return { abi, source: "verified" }
    } catch (err) {
      return handleFailure(chainId, addr, err)
    }
  }

  // proxy-aware fetch; implementation ABI only by default / proxy ဆို impl ABI
  async function fetchAbiWithProxy(address, chainId, { isProxy = false, implementation = null } = {}) {
    if (!settings.enabled) return NONE
    const addr = normalizeAddr(address)
    try {
      const cached = await cache.get(chainId, addr)
      if (cached) {
        return cached.negative
          ? NONE
          : { abi: cached.abi, source: (cached.meta && cached.meta.source) || "verified", meta: cached.meta }
      }

      const endpoint = resolveEndpoint(chainId)

      // 1) prefer analyzer's on-chain proxy info / analyzer proxyResolver ကို ဦးစားပေး
      let implAddr = isProxy && implementation ? normalizeAddr(implementation) : null
      let baseAbi = null

      // 2) unknown → discover via explorer getsourcecode / မသိရင် explorer က ရှာ
      if (!implAddr) {
        const src = await withRetry(() => fetchSource(addr, endpoint))
        baseAbi = src.abi
        if (src.isProxy && src.implementation) implAddr = normalizeAddr(src.implementation)
      }

      // 3) proxy → IMPLEMENTATION ABI only (default policy) / impl ABI ယူ
      if (implAddr) {
        const implAbi = await withRetry(() => fetchRawAbi(implAddr, endpoint))
        const finalAbi = settings.mergeProxyAbi && baseAbi ? mergeFragments(baseAbi, implAbi) : implAbi
        const meta = { source: "verified-proxy-impl", proxy: addr, implementation: implAddr }
        await cache.setPositive(chainId, addr, finalAbi, meta)
        return { abi: finalAbi, source: "verified-proxy-impl", meta }
      }

      // 4) non-proxy → direct ABI / proxy မဟုတ်ရင် တိုက်ရိုက်
      const abi = baseAbi || (await withRetry(() => fetchRawAbi(addr, endpoint)))
      const meta = { source: "verified", via: baseAbi ? "getsourcecode" : "getabi" }
      await cache.setPositive(chainId, addr, abi, meta)
      return { abi, source: "verified", meta }
    } catch (err) {
      return handleFailure(chainId, addr, err)
    }
  }

  function toInterface(abi) {
    try {
      return abi ? new Interface(abi) : null
    } catch (_) {
      return null
    }
  }

  function destroy() {
    limiter.destroy()
  }

  return {
    fetchAbi,
    fetchAbiWithProxy,
    toInterface,
    mergeFragments,
    clearCache: cache.clear,
    destroy,
    _settings: settings,
  }
}

module.exports = { createExplorerService, NONE }
