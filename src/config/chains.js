// Chain registry — chainId တခုချင်းအတွက် metadata
// Adding a new chain = add one entry here, no branching elsewhere.
// chain အသစ်ထည့်ချင်ရင် entry တခုထည့်ရုံ၊ တခြားနေရာ code မပြင်ရ
const CHAINS = {
	1:       { name: "ethereum", symbol: "ETH", explorerApi: "https://api.etherscan.io/api",       explorerKeyEnv: "ETHERSCAN_API_KEY" },
	10:      { name: "optimism", symbol: "ETH", explorerApi: "https://api-optimistic.etherscan.io/api", explorerKeyEnv: "ETHERSCAN_API_KEY" },
	137:     { name: "polygon",  symbol: "POL", explorerApi: "https://api.polygonscan.com/api",     explorerKeyEnv: "POLYGONSCAN_API_KEY" },
	8453:    { name: "base",     symbol: "ETH", explorerApi: "https://api.basescan.org/api",         explorerKeyEnv: "BASESCAN_API_KEY" },
	42161:   { name: "arbitrum", symbol: "ETH", explorerApi: "https://api.arbiscan.io/api",          explorerKeyEnv: "ARBISCAN_API_KEY" },
	7777777: { name: "zora",     symbol: "ETH", explorerApi: "https://explorer.zora.energy/api",     explorerKeyEnv: null },
}

// safe lookup — unknown chain ဆို error / မသိတဲ့ chain ဆို throw
function getChain(chainId) {
	const c = CHAINS[chainId]
	if (!c) throw new Error(`Unsupported chainId: ${chainId}`)
	return c
}

module.exports = { CHAINS, getChain }
