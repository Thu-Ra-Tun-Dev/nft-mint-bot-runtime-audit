// SelectorParser — extract 4-byte selectors from bytecode (opcode-aware)
// bytecode ထဲက PUSH4 selector တွေဆွဲထုတ် (push data ကိုက်လွန့်၊ false match ရှောင်)

function parseSelectors(bytecode) {
	if (!bytecode || bytecode === "0x") return []
	const hex = bytecode.toLowerCase().replace(/^0x/, "")
	const found = new Set()
	let i = 0
	while (i < hex.length - 1) {
		const op = parseInt(hex.slice(i, i + 2), 16)
		// PUSH1..PUSH32 = 0x60..0x7f — skip the pushed bytes
		if (op >= 0x60 && op <= 0x7f) {
			const len = op - 0x5f
			if (op === 0x63) { // PUSH4 → candidate selector constant
				const sel = hex.slice(i + 2, i + 2 + 8)
				if (sel.length === 8) found.add("0x" + sel)
			}
			i += 2 + len * 2
			continue
		}
		i += 2
	}
	// drop padding noise / noise ဖယ်
	found.delete("0x00000000")
	found.delete("0xffffffff")
	return [...found]
}

module.exports = { parseSelectors }
