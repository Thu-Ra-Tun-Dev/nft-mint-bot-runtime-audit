// SimulationProbe — dry-run (eth_call) each mint candidate, classify outcome
// mint candidate တခုချင်းကို eth_call simulate၊ success/revert ခွဲ

const { Interface, ZeroAddress } = require("ethers")
const rpc = require("../rpc/rpcManager")
const { parseRevert } = require("./revertParser")
const { classifyRevert } = require("./revertClassifier")
const { gateFromRequires } = require("./phaseSignals")
const logger = require("../logger/logger")

// build minimal placeholder args from a function signature / dummy arg ဆောက်
function buildArgs(signature) {
	const m = signature.match(/\(([^)]*)\)/)
	const types = m && m[1] ? m[1].split(",").map((t) => t.trim()).filter(Boolean) : []
	return types.map(placeholder)
}

// per-type placeholder / type အလိုက် dummy value
function placeholder(type) {
	if (/\[\]$/.test(type)) return []                       // dynamic array (empty proof)
	if (type === "address") return ZeroAddress
	if (type === "bool") return false
	if (type === "string") return ""
	if (type === "bytes") return "0x"
	if (/^bytes\d+$/.test(type)) return "0x" + "00".repeat(Number(type.replace("bytes", "")))
	if (/^(uint|int)/.test(type)) return 1n                 // qty = 1
	return 0n
}

async function simulateCandidate(candidate, target, from) {
	const provider = rpc.getProvider()
	const iface = new Interface([`function ${candidate.signature}`])
	const data = iface.encodeFunctionData(candidate.name, buildArgs(candidate.signature))

	// value 0 first (price unknown) — revert reason still informative / value 0
	const tx = { to: target, data, from }
	try {
		await rpc.call(provider, "call", tx)
		return { selector: candidate.selector, success: true, gate: gateFromRequires(candidate.requires), classification: null }
	} catch (err) {
		const parsed = parseRevert(err)
		const cls = classifyRevert(parsed)
		return { selector: candidate.selector, success: false, parsed, classification: cls, gate: cls.gate || gateFromRequires(candidate.requires) }
	}
}

async function probeSimulation(analysis, from) {
	const target = analysis.address // call the proxy entrypoint / proxy ကိုခေါ်
	const sender = from || ZeroAddress
	const results = []
	for (const c of analysis.mintCandidates || []) {
		try {
			results.push(await simulateCandidate(c, target, sender))
		} catch (e) {
			logger.debug(`[phase] sim error ${c.name}: ${e && e.message}`)
		}
	}
	return results
}

module.exports = { probeSimulation, simulateCandidate, buildArgs }
