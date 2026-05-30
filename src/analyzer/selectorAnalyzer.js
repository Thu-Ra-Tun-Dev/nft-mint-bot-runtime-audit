// SelectorAnalyzer — map raw selectors ↔ ABI signatures (dynamic)
// ABI ထဲက function selector တွက်ပြီး bytecode selector နဲ့တိုက်

function analyzeSelectors(selectors, iface) {
	const resolved = []
	const bySelector = new Map()

	if (iface) {
		iface.forEachFunction((fn) => bySelector.set(fn.selector.toLowerCase(), fn))
	}

	const toEntry = (fn, fromAbiOnly = false) => ({
		selector: fn.selector,
		signature: fn.format("sighash"),
		name: fn.name,
		stateMutability: fn.stateMutability,
		inputs: fn.inputs.map((i) => i.type),
		payable: fn.stateMutability === "payable",
		resolved: true,
		fromAbiOnly,
	})

	const seen = new Set()
	for (const sel of selectors) {
		seen.add(sel.toLowerCase())
		const fn = bySelector.get(sel.toLowerCase())
		resolved.push(fn ? toEntry(fn) : { selector: sel, resolved: false })
	}

	// ABI functions whose selector isn't in dispatcher (still callable)
	if (iface) {
		iface.forEachFunction((fn) => {
			if (!seen.has(fn.selector.toLowerCase())) resolved.push(toEntry(fn, true))
		})
	}

	return resolved
}

module.exports = { analyzeSelectors }
