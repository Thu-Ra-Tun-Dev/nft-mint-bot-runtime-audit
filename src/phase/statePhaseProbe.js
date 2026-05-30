// StatePhaseProbe — discover phase-revealing view getters & read them live
// phase ဖော်ပြတဲ့ view getter တွေ dynamic ရှာပြီး live ဖတ် (နာမည် hardcode မရှိ)

const { Contract } = require("ethers")
const rpc = require("../rpc/rpcManager")
const { PHASE } = require("./phaseSignals")
const logger = require("../logger/logger")

const RETURN_GUESSES = ["uint256", "bytes32", "bool"]

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

async function probeState(analysis) {
	// IMPORTANT: live view calls must hit the proxy (storage lives there), NOT the impl
	// proxy မှာ storage ရှိလို့ codeTarget(impl) မဟုတ်၊ analysis.address ကိုခေါ်
	const target = analysis.address
	const getters = discoverGetters(analysis)
	if (getters.length === 0) return []

	const provider = rpc.getProvider()
	const hints = []
	for (const g of getters) {
		const val = await readGetter(target, provider, g.name)
		const hint = valueToHint(g.name, val)
		if (hint) hints.push({ ...hint, source: "state" })
	}
	logger.debug(`[phase] state probe: ${hints.length} hint(s) from ${getters.length} getter(s)`)
	return hints
}

module.exports = { probeState, discoverGetters, valueToHint }
