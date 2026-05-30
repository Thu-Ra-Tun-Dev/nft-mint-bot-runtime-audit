// GasController — dynamic fee + EIP-1559/legacy replacement bump (no chain hardcode)
// gas fee ကို live ဆွဲ၊ replacement underpriced မဖြစ်အောင် min bump ထိန်း

const rpc = require("../rpc/rpcManager")
const config = require("../config/settings")
const { REPLACEMENT_FEE_BUMP, GWEI } = require("../config/constants")

// multiply a bigint by a float factor, rounding UP / bigint ကို float နဲ့မြှောက်၊ ceil
function mulCeilFloat(value, factor) {
	if (value === null || value === undefined) return value
	const SCALE = 1_000_000n
	const f = BigInt(Math.round(factor * 1_000_000))
	return (value * f + SCALE - 1n) / SCALE
}

function maxBig(a, b) {
	if (a === null || a === undefined) return b
	if (b === null || b === undefined) return a
	return a > b ? a : b
}

// wei → gwei for reporting / report အတွက် gwei
function toGwei(wei) {
	if (wei === null || wei === undefined) return null
	return Number(wei) / Number(GWEI)
}

// live market fees (1559 or legacy) / market fee ဆွဲ
async function getMarketFees(provider) {
	const fd = await rpc.call(provider, "getFeeData")
	if (fd.maxFeePerGas && fd.maxPriorityFeePerGas) {
		return { type: 2, maxFeePerGas: fd.maxFeePerGas, maxPriorityFeePerGas: fd.maxPriorityFeePerGas }
	}
	return { type: 0, gasPrice: fd.gasPrice } // legacy chain fallback / legacy fallback
}

// apply config multiplier + custom overrides / multiplier + custom override
function applyMultiplier(market) {
	const mult = config.gas.multiplier || 1
	if (market.type === 2) {
		let maxFee = mulCeilFloat(market.maxFeePerGas, mult)
		let maxPrio = mulCeilFloat(market.maxPriorityFeePerGas, mult)
		if (config.gas.mode === "custom") {
			if (config.gas.maxFeeGwei) maxFee = maxBig(maxFee, BigInt(Math.round(config.gas.maxFeeGwei)) * GWEI)
			if (config.gas.maxPriorityGwei) maxPrio = maxBig(maxPrio, BigInt(Math.round(config.gas.maxPriorityGwei)) * GWEI)
		}
		if (maxPrio > maxFee) maxPrio = maxFee // prio must not exceed maxFee / prio <= maxFee
		return { type: 2, maxFeePerGas: maxFee, maxPriorityFeePerGas: maxPrio }
	}
	return { type: 0, gasPrice: mulCeilFloat(market.gasPrice, mult) }
}

// compute fees; previous != null ⇒ replacement
// replacement fee = max(market*multiplier, previous*REPLACEMENT_FEE_BUMP) on BOTH fields, ceil
// replacement = max(market*mult, prev*bump)၊ field နှစ်ခုလုံး၊ round up
async function computeFees(previous = null) {
	const provider = rpc.getProvider()
	const market = applyMultiplier(await getMarketFees(provider))
	if (!previous) return market

	if (market.type === 2 && previous.type === 2) {
		return {
			type: 2,
			maxFeePerGas: maxBig(market.maxFeePerGas, mulCeilFloat(previous.maxFeePerGas, REPLACEMENT_FEE_BUMP)),
			maxPriorityFeePerGas: maxBig(market.maxPriorityFeePerGas, mulCeilFloat(previous.maxPriorityFeePerGas, REPLACEMENT_FEE_BUMP)),
		}
	}
	if (market.type === 0 && previous.type === 0) {
		return { type: 0, gasPrice: maxBig(market.gasPrice, mulCeilFloat(previous.gasPrice, REPLACEMENT_FEE_BUMP)) }
	}
	// fee-type switched (rare) - bump previous to stay valid / type ပြောင်းရင် previous bump
	return previous.type === 2
		? { type: 2, maxFeePerGas: mulCeilFloat(previous.maxFeePerGas, REPLACEMENT_FEE_BUMP), maxPriorityFeePerGas: mulCeilFloat(previous.maxPriorityFeePerGas, REPLACEMENT_FEE_BUMP) }
		: { type: 0, gasPrice: mulCeilFloat(previous.gasPrice, REPLACEMENT_FEE_BUMP) }
}

// upper-bound wei cost for spend-cap accounting / spend-cap gas cost ceiling
function maxGasCost(fees, gasLimit) {
	const price = fees.type === 2 ? fees.maxFeePerGas : fees.gasPrice
	return price * BigInt(gasLimit)
}

module.exports = { computeFees, getMarketFees, applyMultiplier, maxGasCost, mulCeilFloat, maxBig, toGwei }
