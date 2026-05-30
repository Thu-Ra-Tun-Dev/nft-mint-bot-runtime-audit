// EventScanner — ABI events + recent-log sampling to see which actually fire
// ABI event topic တွက်၊ recent log sample နဲ့ ဘယ် event fire လဲစစ်

const rpc = require("../rpc/rpcManager")
const logger = require("../logger/logger")

async function scanEvents(address, iface, { sampleBlocks = 5000 } = {}) {
	const events = []
	if (!iface) return events

	iface.forEachEvent((ev) => {
		events.push({
			name: ev.name,
			signature: ev.format("sighash"),
			topic: ev.topicHash, // topic0
			seen: false,
		})
	})

	// best-effort recent-log sample / recent log အနည်းငယ်စစ် (optional)
	try {
		const provider = rpc.getProvider()
		const latest = await rpc.call(provider, "getBlockNumber")
		const fromBlock = Math.max(0, latest - sampleBlocks)
		const logs = await rpc.call(provider, "getLogs", { address, fromBlock, toBlock: latest })
		const firedTopics = new Set(logs.map((l) => l.topics[0]))
		for (const e of events) if (firedTopics.has(e.topic)) e.seen = true
	} catch (_) {
		logger.debug("[analyzer] event log sampling skipped")
	}

	return events
}

module.exports = { scanEvents }
