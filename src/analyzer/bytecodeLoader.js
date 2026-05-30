// BytecodeLoader — fetch runtime bytecode via rpcManager
// runtime bytecode ကို rpcManager ကနေသုံးဆွဲယူ

const rpc = require("../rpc/rpcManager")

// returns { address, bytecode, isContract } / EOA ဆို bytecode = 0x
async function loadBytecode(address) {
	const provider = rpc.getProvider()
	const bytecode = await rpc.call(provider, "getCode", address)
	const isContract = !!bytecode && bytecode !== "0x"
	return { address, bytecode: bytecode || "0x", isContract }
}

module.exports = { loadBytecode }
