// Explorer errors — typed failures; all map to a non-fatal null-ABI outcome
// explorer error အမျိုးအစား — service boundary မှာ { abi: null, source: "none" } ဖြစ်သွား

class ExplorerError extends Error {
  constructor(message, code) {
    super(message)
    this.name = this.constructor.name
    this.code = code || "EXPLORER_ERROR"
  }
}

// chains.js မှာ explorer endpoint မရှိ / unsupported chain
class UnsupportedChainError extends ExplorerError {
  constructor(chainId) {
    super(`No explorer endpoint configured for chainId=${chainId}`, "UNSUPPORTED_CHAIN")
    this.chainId = chainId
  }
}

// explorerKeyEnv သတ်မှတ်ထားပေမယ့် env key မရှိ
class MissingApiKeyError extends ExplorerError {
  constructor(envName, chainId) {
    super(`Missing explorer API key (env ${envName}) for chainId=${chainId}`, "MISSING_API_KEY")
    this.envName = envName
    this.chainId = chainId
  }
}

// contract source မ verify ရသေး — terminal, retry မလုပ်
class NotVerifiedError extends ExplorerError {
  constructor(address) {
    super(`Contract source code not verified: ${address}`, "NOT_VERIFIED")
    this.address = address
  }
}

// explorer rate limit — backoff retry
class RateLimitedError extends ExplorerError {
  constructor(message) {
    super(message || "Explorer rate limit reached", "RATE_LIMITED")
  }
}

// HTTP / network failure
class ExplorerHttpError extends ExplorerError {
  constructor(message, status) {
    super(message || "Explorer HTTP error", "HTTP_ERROR")
    this.status = status
  }
}

module.exports = {
  ExplorerError,
  UnsupportedChainError,
  MissingApiKeyError,
  NotVerifiedError,
  RateLimitedError,
  ExplorerHttpError,
}
