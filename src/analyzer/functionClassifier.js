// FunctionClassifier — tag functions by structural signals (no collection hardcode)
// arg ပုံစံ / mutability အရ structural signal နဲ့ tag (နာမည်က soft signal သာ)

// argument-shape signals / arg ပုံစံ signal
function shapeSignals(inputs = []) {
	const joined = inputs.join(",")
	return {
		hasQty: inputs.some((t) => /^uint(8|16|32|64|96|128|256)?$/.test(t)),
		hasProof: /bytes32\[\]/.test(joined),   // merkle proof
		hasSignature: inputs.includes("bytes"),  // signature blob
		hasRecipient: inputs.includes("address"),
		argCount: inputs.length,
	}
}

function classifyFunctions(resolvedSelectors) {
	return resolvedSelectors
		.filter((f) => f.resolved)
		.map((f) => {
			const sig = shapeSignals(f.inputs)
			const writable = !["view", "pure"].includes(f.stateMutability)
			// soft hints only — never authoritative / သေမှုတ်သော signal
			const nameHint = /mint|claim|purchase|buy|order/i.test(f.name || "")
			const adminHint = /owner|admin|withdraw|^set|pause|airdrop|reserve/i.test(f.name || "")
			return { ...f, writable, signals: { ...sig, payable: !!f.payable, nameHint, adminHint } }
		})
}

module.exports = { classifyFunctions, shapeSignals }
