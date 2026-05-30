#!/usr/bin/env node
// src/index.js — NFT Auto Mint Bot · official application entrypoint (Phase 24)
// project module အားလုံးကို တစ်နေရာတည်းမှာ wire လုပ်ပြီး bot ကို စတင်မောင်းနှင်
// Startup → DI → init → run (runRetry) → graceful shutdown. Verified exports/signatures only.

const { parseEther, getAddress } = require("ethers")

// --- core singletons (require order matters: config validates first) ---
const config = require("./config/settings")        // Object.freeze config, validates on load
const logger = require("./logger/logger")
const rpc = require("./rpc/rpcManager")             // singleton RpcManager
const keystore = require("./wallet/keystore")       // singleton Keystore
const nonceManager = require("./wallet/nonceManager")

// --- pipeline modules (verified exports) ---
const { analyzeContract } = require("./analyzer")
const { detectMintStrategy } = require("./detector")
const { detectPhase } = require("./phase")
const { runRetry, createControl } = require("./retry")

// --- optional/best-effort layers (exports verified; signatures not in verified set → guarded) ---
const { recognizePlatform } = require("./platform")
const perf = require("./perf")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// run an optional hook without ever crashing startup / optional hook — fail လည်း bot မရပ်
async function safe(label, fn) {
	try {
		return await fn()
	} catch (e) {
		logger.debug(`[optional] ${label} skipped: ${e && e.message}`)
		return null
	}
}

// ---------- input (argv first, then env) / input ဖတ် ----------
function readTarget() {
	const raw = process.argv[2] || process.env.TARGET_CONTRACT
	if (!raw) throw new Error("Usage: node src/index.js <TARGET_CONTRACT> [valueEthPerMint]  (or set TARGET_CONTRACT)")
	return getAddress(raw) // checksum validate / address မှန်/မမှန်စစ်
}

function readValue() {
	const raw = process.argv[3] || process.env.MINT_VALUE_ETH || "0"
	try {
		return parseEther(String(raw))
	} catch (_) {
		throw new Error(`Invalid mint value (ETH): ${raw}`)
	}
}

function readMintArgs() {
	const raw = process.env.MINT_ARGS
	if (!raw) return null // null → runRetry uses dynamic placeholder args / arg မပေးရင် placeholder
	try {
		const a = JSON.parse(raw)
		return Array.isArray(a) ? a : null
	} catch (_) {
		logger.warn("[boot] MINT_ARGS is not a valid JSON array; ignoring")
		return null
	}
}

// ---------- health check + auto recovery / RPC health + auto recover ----------
async function ensureHealthyRpc(maxAttempts = 5) {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const entries = await rpc.healthCheck()
		const healthy = entries.filter((e) => e.healthy).length
		const wsUp = !!rpc.getWsProvider()
		if (healthy > 0 || wsUp) {
			logger.info(`[boot] RPC ready (http ${healthy}/${entries.length}, ws ${wsUp ? "up" : "down"})`)
			return
		}
		const delay = Math.min(1000 * attempt, 5000) // capped backoff / backoff cap
		logger.warn(`[boot] no healthy RPC (attempt ${attempt}/${maxAttempts}); retry in ${delay}ms`)
		await sleep(delay)
	}
	throw new Error("[boot] no healthy RPC endpoint after retries")
}

// ---------- bootstrap / dependency injection / module init ----------
async function bootstrap() {
	logger.info(`[boot] chainId=${config.chainId} wallets=${config.wallet.privateKeys.length}`)
	await ensureHealthyRpc()

	const provider = rpc.getProvider()
	keystore.connect(provider) // inject provider into every signer / signer တွေ provider ချိတ်
	const wallets = keystore.getAll()
	if (wallets.length === 0) throw new Error("[boot] no wallets loaded")

	// pre-sync nonce per wallet / wallet တခုချင်း nonce sync
	for (const w of wallets) {
		await nonceManager.sync(w.signer)
	}

	await safe("perf.profile", () => perf.profile()) // optional runtime profile / optional
	logger.info(`[boot] ${wallets.length} wallet(s) connected & nonce-synced`)
	return { provider, wallets, primary: keystore.primary() }
}

// ---------- monitoring (health + memory heartbeat) / monitor ----------
let monitorTimer = null
function startMonitor(intervalMs = 30000) {
	stopMonitor()
	monitorTimer = setInterval(async () => {
		const rssMb = (process.memoryUsage().rss / 1048576).toFixed(1)
		let healthy = 0
		let total = 0
		try {
			const entries = await rpc.healthCheck()
			total = entries.length
			healthy = entries.filter((e) => e.healthy).length
		} catch (_) {}
		logger.info(`[monitor] rss=${rssMb}MB rpc=${healthy}/${total} ws=${rpc.getWsProvider() ? "up" : "down"} uptime=${Math.round(process.uptime())}s`)
	}, intervalMs)
	if (monitorTimer.unref) monitorTimer.unref() // don't keep process alive / process မဆွဲထား
}
function stopMonitor() {
	if (monitorTimer) clearInterval(monitorTimer)
	monitorTimer = null
}

// ---------- result logging / RetryReport log ----------
function logReport(report) {
	if (!report) {
		logger.warn("[result] no RetryReport returned")
		return
	}
	logger.tx(`[result] status=${report.status} phase=${report.phase} attempts=${report.attempts} tx=${report.successTxHash || "-"} stop=${report.stopReason}`)
	if (Array.isArray(report.wallets)) {
		for (const w of report.wallets) {
			logger.info(`[result] ${w.label || w.address}: ${w.status} attempts=${w.attempts} ${w.txHash || ""}`)
		}
	}
}

// ---------- graceful shutdown / graceful shutdown ----------
let control = null
let shuttingDown = false
function installShutdown() {
	const shutdown = (signal) => {
		if (shuttingDown) return
		shuttingDown = true
		logger.warn(`[shutdown] ${signal} received; stopping…`)
		if (control) control.stop(signal) // signal retry loop to stop / loop ကိုရပ်ခိုင်း
		stopMonitor()
		// safety net: hard-exit if the loop doesn't settle / loop မပြီးရင် အတင်းထွက်
		const t = setTimeout(() => {
			try { rpc.destroy() } catch (_) {}
			process.exit(130)
		}, 8000)
		if (t.unref) t.unref()
	}
	process.on("SIGINT", () => shutdown("SIGINT"))
	process.on("SIGTERM", () => shutdown("SIGTERM"))
	process.on("unhandledRejection", (reason) => logger.error("[unhandledRejection]", reason))
	process.on("uncaughtException", (err) => {
		logger.error("[uncaughtException]", err)
		shutdown("uncaughtException")
	})
}

// ---------- main pipeline / canonical execution path ----------
async function main() {
	const target = readTarget()
	const value = readValue()
	const mintArgs = readMintArgs()

	const { primary } = await bootstrap()
	const from = primary.address // simulate/estimate sender / simulate အတွက် sender

	startMonitor()

	logger.tx(`[run] target=${target} from=${from} value=${value.toString()}wei`)

	// 1) analyze contract (dynamic, no hardcode) / contract analyze
	const analysis = await analyzeContract(target)

	// 2) platform recognition — optional enrichment (guarded) / platform (optional)
	const platform = await safe("recognizePlatform", () => recognizePlatform(analysis))
	if (platform) logger.info(`[platform] ${platform.name || platform.platform || JSON.stringify(platform)}`)

	// 3) mint strategy / strategy ရွေး
	const strategy = detectMintStrategy(analysis)
	if (!strategy || !strategy.primary) throw new Error(`[run] no mint strategy detected for ${target}`)

	// 4) live phase / phase
	const phaseReport = await detectPhase(analysis, strategy, { from })
	logger.info(`[run] phase=${phaseReport.activePhase} conf=${phaseReport.confidence}`)

	// 5) drive the retry engine (it builds RetryContext internally) / runRetry — canonical driver
	control = createControl()
	const report = await runRetry({
		analysis,
		strategy,
		phaseReport,
		mintArgs,
		value,
		from,
		control,
		options: {},
	})

	return report
}

// ---------- entrypoint bootstrap / start ----------
installShutdown()
main()
	.then((report) => {
		logReport(report)
		stopMonitor()
		try { rpc.destroy() } catch (_) {}
		// exit 0 only on a confirmed mint / mint အောင်မှ exit 0
		process.exit(report && report.status === "minted" ? 0 : 1)
	})
	.catch((err) => {
		logger.error("[fatal]", err)
		stopMonitor()
		try { rpc.destroy() } catch (_) {}
		process.exit(1)
	})
