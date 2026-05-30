// Central config loader — .env ကို parse လုပ်ပြီး structured config object ထုတ်ပေးတယ်
// English: single source of truth for all runtime configuration.

require("dotenv").config()
const { parseEther } = require("ethers")

// CSV string → trimmed array / CSV string ကို array ပြောင်း
function parseList(value) {
	if (!value) return []
	return value.split(",").map((v) => v.trim()).filter(Boolean)
}

// env → boolean with fallback / env string ကို boolean ပြောင်း
function parseBool(value, fallback = false) {
	if (value === undefined || value === "") return fallback
	return /^(1|true|yes|on)$/i.test(value.trim())
}

// env → number with fallback / number ပြောင်း၊ မမှန်ရင် fallback
function parseNum(value, fallback) {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

const config = {
	chainId: parseNum(process.env.CHAIN_ID, 1),

	// RPC pool — failover + broadcast race / RPC အများ၊ တခုကျရင်နောက်တခု
	rpc: {
		httpUrls: parseList(process.env.RPC_HTTP_URLS),
		wsUrls: parseList(process.env.RPC_WS_URLS),
		timeoutMs: parseNum(process.env.RPC_TIMEOUT_MS, 5000),
		maxConcurrent: parseNum(process.env.RPC_MAX_CONCURRENT, 8),
	},

	// Wallet — multi-key, index-matched labels / multi-wallet mint အတွက်
	wallet: {
		privateKeys: parseList(process.env.PRIVATE_KEYS),
		labels: parseList(process.env.WALLET_LABELS),
	},

	// Retry — backoff + hard spend cap / retry spam ပေမယ့် ပိုက်ဆံမကုန်အောင် cap
	retry: {
		maxRetry: parseNum(process.env.MAX_RETRY, 50),
		backoffMs: parseNum(process.env.RETRY_BACKOFF_MS, 100),
		backoffMaxMs: parseNum(process.env.RETRY_BACKOFF_MAX_MS, 2000),
		jitterMs: parseNum(process.env.RETRY_JITTER_MS, 50),
		// ETH → wei once at load / တကြိမ်တည်း wei ပြောင်းထား
		spendCapWei: parseEther(String(parseNum(process.env.SPEND_CAP_ETH, 0.5))),
	},

	// Gas — null means "derive at runtime" / null ဆို runtime မှာတွက်
	gas: {
		mode: process.env.GAS_MODE || "aggressive",
		maxFeeGwei: process.env.MAX_FEE_GWEI ? parseNum(process.env.MAX_FEE_GWEI) : null,
		maxPriorityGwei: process.env.MAX_PRIORITY_GWEI ? parseNum(process.env.MAX_PRIORITY_GWEI) : null,
		multiplier: parseNum(process.env.GAS_MULTIPLIER, 1.25),
		limitBuffer: parseNum(process.env.GAS_LIMIT_BUFFER, 1.2),
	},

	// Feature toggles — runtime behavior switches / feature တွေဖွင့်ပိတ်
	features: {
		wsWatcher: parseBool(process.env.FEATURE_WS_WATCHER, true),
		multiRpcBroadcast: parseBool(process.env.FEATURE_MULTI_RPC_BROADCAST, true),
		simulateBeforeSend: parseBool(process.env.FEATURE_SIMULATE_BEFORE_SEND, true),
		autoProofFetch: parseBool(process.env.FEATURE_AUTO_PROOF_FETCH, true),
		revertParser: parseBool(process.env.FEATURE_REVERT_PARSER, true),
	},

	logging: {
		level: process.env.LOG_LEVEL || "info",
		toFile: parseBool(process.env.LOG_TO_FILE, true),
	},
        explorer: {
                 enabled: parseBool(process.env.EXPLORER_ENABLED, false),
                 timeoutMs: parseNum(process.env.EXPLORER_TIMEOUT_MS, 8000),
                 maxRetries: parseNum(process.env.EXPLORER_MAX_RETRIES, 3),
                 rps: parseNum(process.env.EXPLORER_RPS, 5),
                 cacheDir: process.env.EXPLORER_CACHE_DIR || ".cache/abi",
                 negativeTtlMs: parseNum(process.env.EXPLORER_NEGATIVE_TTL_MS, 300000),
                 mergeProxyAbi: parseBool(process.env.EXPLORER_MERGE_PROXY_ABI, false),
        },
}

// fail-fast — production startup မှာ misconfig ကို တချက်တည်းဖမ်း
function validate(c) {
	if (c.rpc.httpUrls.length === 0 && c.rpc.wsUrls.length === 0)
		throw new Error("Config: no RPC endpoints set")
	if (c.wallet.privateKeys.length === 0)
		throw new Error("Config: no wallet private keys set")
	if (!["normal", "aggressive", "custom"].includes(c.gas.mode))
		throw new Error(`Config: invalid GAS_MODE "${c.gas.mode}"`)
	// label count mismatch ဆို index-match မမှန်ဘူး
	if (c.wallet.labels.length && c.wallet.labels.length !== c.wallet.privateKeys.length)
		throw new Error("Config: WALLET_LABELS count != PRIVATE_KEYS count")
}
validate(config)

module.exports = Object.freeze(config)
