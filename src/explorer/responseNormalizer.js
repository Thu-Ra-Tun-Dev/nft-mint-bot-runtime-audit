// ResponseNormalizer — Etherscan API V2 envelope → uniform { ok, abi, ... } or typed error
// V2 response ကို တူညီတဲ့ပုံစံ ပြောင်း / unverified · rate-limit · deprecated · NOTOK ကို ခွဲ

const { NotVerifiedError, RateLimitedError, ExplorerHttpError } = require("./errors")

const NOT_VERIFIED_MARKERS = ["contract source code not verified", "contract not verified", "abi not found"]
const RATE_LIMIT_MARKERS = ["max rate limit reached", "rate limit", "too many requests"]
// legacy V1 callers get this; on V2 it should never appear / V1 ဆို ဒီ message ပြ
const DEPRECATED_MARKERS = ["deprecated v1 endpoint", "switch to etherscan api v2"]

function parseAbi(raw) {
  const abi = JSON.parse(raw)
  if (!Array.isArray(abi)) throw new Error("ABI is not an array")
  return abi
}

// message/result ကို typed error အဖြစ်ခွဲ / classify NOTOK payloads
function classifyError(message, result, address) {
  const hay = `${message || ""} ${typeof result === "string" ? result : ""}`.toLowerCase()
  if (NOT_VERIFIED_MARKERS.some((m) => hay.includes(m))) return new NotVerifiedError(address)
  if (RATE_LIMIT_MARKERS.some((m) => hay.includes(m))) return new RateLimitedError(message)
  if (DEPRECATED_MARKERS.some((m) => hay.includes(m)))
    return new ExplorerHttpError("Etherscan V1 endpoint deprecated — service is configured for V2")
  return new ExplorerHttpError(message || "explorer NOTOK")
}

// action=getabi → result is a JSON-string ABI
function normalizeGetAbi(envelope, address) {
  const { status, message, result } = envelope || {}
  if (String(status) === "1" && typeof result === "string") return { ok: true, abi: parseAbi(result) }
  throw classifyError(message, result, address)
}

// action=getsourcecode → result[0] carries ABI / Proxy / Implementation
function normalizeGetSource(envelope, address) {
  const { status, message, result } = envelope || {}
  if (String(status) === "1" && Array.isArray(result) && result[0]) {
    const row = result[0]
    const abiStr = row.ABI
    if (!abiStr || /not verified/i.test(abiStr)) throw new NotVerifiedError(address)
    const isProxy = String(row.Proxy) === "1"
    const implementation =
      row.Implementation && /^0x[0-9a-fA-F]{40}$/.test(row.Implementation) ? row.Implementation : null
    return { ok: true, abi: parseAbi(abiStr), isProxy, implementation, contractName: row.ContractName || null }
  }
  throw classifyError(message, result, address)
}

module.exports = { normalizeGetAbi, normalizeGetSource, classifyError }
