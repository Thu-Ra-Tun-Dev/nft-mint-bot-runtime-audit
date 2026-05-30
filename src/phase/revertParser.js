// RevertParser — decode revert payload → { reason, errorSelector, panic }
// revert data ကို decode → reason string / custom error selector

const { AbiCoder } = require("ethers")

const ERROR_STRING_SELECTOR = "0x08c379a0" // Error(string)
const PANIC_SELECTOR = "0x4e487b71"        // Panic(uint256)

const coder = AbiCoder.defaultAbiCoder()

// pull revert data out of various ethers/RPC error shapes / error shape အမျိုးမျိုးကနေ data
function extractRevertData(err) {
	if (!err) return null
	if (typeof err === "string" && err.startsWith("0x")) return err
	return (
		(err.data && err.data.data) ||   // nested provider error
		err.data ||                       // ethers CALL_EXCEPTION
		(err.error && err.error.data) ||  // json-rpc error
		(err.info && err.info.error && err.info.error.data) ||
		null
	)
}

function parseRevert(err) {
	const data = extractRevertData(err)
	const out = { raw: data || null, reason: null, errorSelector: null, panic: null }

	// no decodable data → fall back to message / data မရှိရင် message သုံး
	if (!data || typeof data !== "string" || data.length < 10) {
		out.reason = (err && (err.shortMessage || err.reason || err.message)) || null
		return out
	}

	const selector = data.slice(0, 10).toLowerCase()
	out.errorSelector = selector

	try {
		if (selector === ERROR_STRING_SELECTOR) {
			out.reason = coder.decode(["string"], "0x" + data.slice(10))[0]
		} else if (selector === PANIC_SELECTOR) {
			out.panic = coder.decode(["uint256"], "0x" + data.slice(10))[0].toString()
			out.reason = `Panic(${out.panic})`
		} else {
			// custom error — selector only (no ABI) / custom error: selector ပဲ
			out.reason = (err && (err.shortMessage || err.reason)) || null
		}
	} catch (_) {
		out.reason = (err && (err.shortMessage || err.reason || err.message)) || null
	}
	return out
}

module.exports = { parseRevert, extractRevertData, ERROR_STRING_SELECTOR, PANIC_SELECTOR }
