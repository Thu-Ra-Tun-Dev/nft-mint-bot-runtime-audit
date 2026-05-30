// CalldataBuilder — dynamic calldata encode from a mint signature (no hardcoded selectors)
// signature ကနေ arg တွေ dynamic order လုပ်ပြီး calldata encode (selector hardcode မရှိ)

const { Interface, ZeroAddress } = require("ethers")

// parse solidity arg types from a function signature / signature ထဲက arg type
function parseTypes(signature) {
	const m = signature.match(/\(([^)]*)\)/)
	if (!m || !m[1]) return []
	return m[1].split(",").map((t) => t.trim()).filter(Boolean)
}

// per-type placeholder / type အလိုက် dummy value (sim/estimate အတွက်)
function placeholder(type) {
	if (/\[\]$/.test(type)) return []
	if (type === "address") return ZeroAddress
	if (type === "bool") return false
	if (type === "string") return ""
	if (type === "bytes") return "0x"
	if (/^bytes\d+$/.test(type)) return "0x" + "00".repeat(Number(type.replace("bytes", "")))
	if (/^(uint|int)/.test(type)) return 1n
	return 0n
}

// infer the role of one arg from its solidity type / type ကနေ role ခန့်မှန်း
function roleOf(type) {
	if (/^bytes32\[\]$/.test(type)) return "proof"      // merkle proof
	if (type === "bytes") return "signature"            // signature blob
	if (type === "address") return "recipient"
	if (/^(uint|int)\d*$/.test(type)) return "qty"
	return null
}

// build ordered args from a named map, else placeholders / named -> ordered args
// named = { qty, proof, signature, recipient, extra: { <index>: value } }
function orderArgs(signature, named = {}, from = null) {
	const types = parseTypes(signature)
	let qtyUsed = false
	let recipientUsed = false

	return types.map((type, i) => {
		// explicit positional override wins / index override ဦးစား
		if (named.extra && named.extra[i] !== undefined) return named.extra[i]

		const role = roleOf(type)
		if (role === "proof" && named.proof !== undefined) return named.proof
		if (role === "signature" && named.signature !== undefined) return named.signature
		if (role === "recipient") {
			// first address = recipient, default to sender / ပထမ address = recipient
			if (!recipientUsed) {
				recipientUsed = true
				if (named.recipient !== undefined) return named.recipient
				if (from) return from
			}
			return placeholder(type)
		}
		if (role === "qty") {
			// first integer = quantity / ပထမ integer = qty
			if (!qtyUsed) {
				qtyUsed = true
				if (named.qty !== undefined) return BigInt(named.qty)
				return 1n
			}
			return placeholder(type)
		}
		return placeholder(type)
	})
}

// encode calldata. args(array) used verbatim; else order a named map / calldata ဆောက်
function buildCalldata({ signature, name, args = null, named = null, from = null }) {
	const iface = new Interface([`function ${signature}`])
	const fnName = name || signature.slice(0, signature.indexOf("("))
	const ordered = Array.isArray(args) ? args : orderArgs(signature, named || {}, from)
	const data = iface.encodeFunctionData(fnName, ordered)
	return { data, args: ordered, iface }
}

module.exports = { buildCalldata, orderArgs, parseTypes, placeholder, roleOf }
