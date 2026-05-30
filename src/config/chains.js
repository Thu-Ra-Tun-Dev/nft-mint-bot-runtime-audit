// Chain registry — chainId တခုချင်းအတွက် metadata
// Adding a new chain = add one entry here, no branching elsewhere.
// chain အသစ်ထည့်ချင်ရင် entry တခုထည့်ရုံ၊ တခြားနေရာ code မပြင်ရ
//
// seadropRouter — OpenSea SeaDrop 1.0 router contract (getPublicDrop / mintPublic live here, NOT on the token)
// SeaDrop 1.0 router (getPublicDrop / mintPublic ဒီ contract မှာ၊ token မှာမဟုတ်)
// Only mainnet is verified. Leave null until each chain's deployment is independently confirmed.
// mainnet ပဲ verify လုပ်ပြီး၊ ကျန် chain တွေ confirm မလုပ်မချင်း null ထားမယ်
const CHAINS = {
  1: { name: "ethereum", symbol: "ETH", explorerApi: "https://api.etherscan.io/api", explorerKeyEnv: "ETHERSCAN_API_KEY", seadropRouter: "0x00005ea00ac477b1030ce78506496e8c2de24bf5" },
  10: { name: "optimism", symbol: "ETH", explorerApi: "https://api-optimistic.etherscan.io/api", explorerKeyEnv: "ETHERSCAN_API_KEY", seadropRouter: null },
  137: { name: "polygon", symbol: "POL", explorerApi: "https://api.polygonscan.com/api", explorerKeyEnv: "POLYGONSCAN_API_KEY", seadropRouter: null },
  8453: { name: "base", symbol: "ETH", explorerApi: "https://api.basescan.org/api", explorerKeyEnv: "BASESCAN_API_KEY", seadropRouter: null },
  42161: { name: "arbitrum", symbol: "ETH", explorerApi: "https://api.arbiscan.io/api", explorerKeyEnv: "ARBISCAN_API_KEY", seadropRouter: null },
  7777777: { name: "zora", symbol: "ETH", explorerApi: "https://explorer.zora.energy/api", explorerKeyEnv: null, seadropRouter: null },
}

// safe lookup — unknown chain ဆို error / မသိတဲ့ chain ဆို throw
function getChain(chainId) {
  const c = CHAINS[chainId]
  if (!c) throw new Error(`Unsupported chainId: ${chainId}`)
  return c
}

// non-throwing SeaDrop router lookup — unconfigured/unknown chain ဆို null
// throw မလုပ်ဘဲ null ပြန်၊ phase probe က gracefully skip လုပ်နိုင်အောင်
function getSeaDropRouter(chainId) {
  const c = CHAINS[chainId]
  return (c && c.seadropRouter) || null
}

module.exports = { CHAINS, getChain, getSeaDropRouter }
