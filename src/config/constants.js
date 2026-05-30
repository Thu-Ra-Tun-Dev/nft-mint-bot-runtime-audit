// Shared constants & enums — magic value တွေကို တနေရာတည်းမှာစုထား
module.exports = Object.freeze({
	GAS_MODE: { NORMAL: "normal", AGGRESSIVE: "aggressive", CUSTOM: "custom" },

	// retry classification — FATAL ကို ဘယ်တော့မှ retry မလုပ်ရ
	RETRY_CLASS: { RETRYABLE: "retryable", FATAL: "fatal" },

	// mint phases / mint အဆင့်များ
	MINT_PHASE: { WL: "wl", GTD: "gtd", FCFS: "fcfs", PUBLIC: "public" },

	// EIP minimum replacement bump = +12.5% / tx replace ဖို့ အနည်းဆုံး fee bump
	REPLACEMENT_FEE_BUMP: 1.125,

	HEARTBEAT_INTERVAL_MS: 15000, // ws ping interval
	WS_RECONNECT_MAX_MS: 5000,    // snipe speed cap
	GWEI: 1_000_000_000n,
})
