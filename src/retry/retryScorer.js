// RetryScorer — rank wallets + score attempts (primary-first, readiness-weighted)
// wallet တွေကို priority စီ၊ attempt score တွက် (primary ဦးစား၊ balance/gate ကြည့်)

const rpc = require("../rpc/rpcManager")
const logger = require("../logger/logger")

// gate match: required gate unmet -> low / လိုအပ်တဲ့ gate မမှန်ရင် နိမ့်
function gateMatch(ctx) {
	const g = ctx.gating || {}
	// wallet-agnostic gating only; unmet hard gate lowers all (per-wallet handled at send time)
	// per-wallet proof/sig က send အချိန် fail recovery မှာ ကိိင်
if (g.needsProof || g.needsSignature || g.needsHolderToken) return 0.3
	return 1
}

// assess one wallet readiness via balance / wallet balance ကြည့်ပြီး ready လား
async function assessWallet(wallet, ctx, gasCeiling) {
	const provider = rpc.getProvider()
	let ready = true
	let balance = 0n
	try {
		balance = await rpc.call(provider, "getBalance", wallet.address)
		ready = balance >= (ctx.value + gasCeiling) // value + gas headroom / value+gas လောက်ရှိ
	} catch (e) {
		logger.debug(`[retry] balance check failed ${wallet.label}: ${e && e.message}`)
	}
	return { wallet, address: wallet.address, label: wallet.label, balance, ready }
}

// attempt score = openConfidence * gateMatch * walletReady / attempt အမှတ်
function attemptScore(ctx, ready) {
	return (ctx.openConfidence || 0) * gateMatch(ctx) * (ready ? 1 : 0.2)
}

// rank wallets: primary first, then by score / primary ဦးဆုံး၊ ပြီး score
async function rankWallets(wallets, ctx, gasCeiling) {
	const assessed = []
	for (const w of wallets) assessed.push(await assessWallet(w, ctx, gasCeiling))
	return assessed
		.map((a) => ({ ...a, score: attemptScore(ctx, a.ready) }))
		.sort((a, b) => {
			if (a.wallet.index === 0) return -1 // primary wallet first / primary ဦးဆုံး
			if (b.wallet.index === 0) return 1
			return b.score - a.score
		})
}

module.exports = { rankWallets, attemptScore, gateMatch, assessWallet }
