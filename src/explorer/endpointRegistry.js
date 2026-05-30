// EndpointRegistry — resolve Etherscan API V2 (unified multichain) endpoint
// V1 per-chain endpoints were fully deprecated 2025-08-15 → V2 = base တခု + chainid
// chains.js ကို supported-chain allowlist အဖြစ်သာသုံး (V2 unified base + chainid query)

const { getChain } = require("../config/chains")
const { UnsupportedChainError, MissingApiKeyError } = require("./errors")

// Etherscan API V2 — one unified base for every supported chain
// chain အားလုံးအတွက် base တခုတည်း၊ chainid ကို query param အဖြစ်ပို့
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api"

// chainId → { baseUrl, apiKey, apiKeyEnv, chainParam } / chain အလိုက် V2 endpoint
function resolveEndpoint(chainId) {
  // keep chains.js as the supported-chain gate (fail fast on unknown ids)
  // chains.js ထဲ မရှိရင် throw → unsupported chain
  try {
    getChain(chainId) // chains.js: throws "Unsupported chainId" if absent
  } catch (_) {
    throw new UnsupportedChainError(chainId)
  }

  // V2: ONE ETHERSCAN_API_KEY authorizes all supported chains / key တခုတည်း
  const apiKey = process.env.ETHERSCAN_API_KEY || ""
  // key unset → cannot call a keyed endpoint / key မရှိရင် throw
  if (!apiKey) throw new MissingApiKeyError("ETHERSCAN_API_KEY", chainId)

  return {
    chainId,
    baseUrl: ETHERSCAN_V2_BASE, // V2 unified base (no per-chain domains)
    apiKey,
    apiKeyEnv: "ETHERSCAN_API_KEY",
    chainParam: chainId, // becomes ?chainid=<id>
  }
}

module.exports = { resolveEndpoint }
