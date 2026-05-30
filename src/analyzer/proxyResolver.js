// ProxyResolver — detect proxy & resolve implementation (EIP-1967/1822/1167/beacon)
// proxy လားစစ်၊ impl address ရှာ (dynamic, slot တူနိုင်းသုံး)

const { getAddress } = require("ethers")
const rpc = require("../rpc/rpcManager")

// standardized proxy storage slots / စံနှုန်း proxy slot များ
const SLOTS = {
	eip1967Impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
	eip1967Beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
	eip1822: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bec8",
}

// extract an address from a 32-byte storage word / slot ထဲက address
function addrFromSlot(word) {
	if (!word || word === "0x" || /^0x0+$/.test(word)) return null
	try {
		const addr = getAddress("0x" + word.slice(-40))
		return /^0x0+$/.test(addr) ? null : addr
	} catch (_) { return null }
}

// EIP-1167 minimal proxy embeds impl in bytecode / minimal proxy ဖမ်း
function parseMinimalProxy(bytecode) {
	if (!bytecode) return null
	const m = bytecode.toLowerCase().match(
		/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/,
	)
	if (!m) return null
	try { return getAddress("0x" + m[1]) } catch (_) { return null }
}

// resolve implementation behind a proxy (best-effort) / impl ရှာ
async function resolveProxy(address, bytecode) {
	// 1) minimal proxy — read straight from bytecode
	const minimal = parseMinimalProxy(bytecode)
	if (minimal) return { isProxy: true, kind: "eip1167", implementation: minimal }

	const provider = rpc.getProvider()
	// 2) standard impl slots / impl slot စစ်
	for (const [kind, slot] of [["eip1967", SLOTS.eip1967Impl], ["eip1822", SLOTS.eip1822]]) {
		try {
			const word = await rpc.call(provider, "getStorage", address, slot)
			const impl = addrFromSlot(word)
			if (impl) return { isProxy: true, kind, implementation: impl }
		} catch (_) {}
	}
	// 3) beacon proxy — slot holds beacon address / beacon proxy
	try {
		const word = await rpc.call(provider, "getStorage", address, SLOTS.eip1967Beacon)
		const beacon = addrFromSlot(word)
		if (beacon) return { isProxy: true, kind: "beacon", beacon, implementation: null }
	} catch (_) {}

	return { isProxy: false, implementation: null }
}

module.exports = { resolveProxy, parseMinimalProxy }
