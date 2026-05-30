// AbiResolver — build an ethers Interface from available ABI evidence
// verified ABI ရှိရင်သုံး၊ မရှိရင် derived fragment တွေနဲ့တည်ဆောက်
// မည်သည့် collection မှ မဟုတ်ခေါဍ်ပါ (no hardcode)

const { Interface } = require("ethers")

function resolveAbi({ verifiedAbi = null, extraFragments = [] } = {}) {
	const fragments = []
	if (Array.isArray(verifiedAbi)) fragments.push(...verifiedAbi)
	if (Array.isArray(extraFragments)) fragments.push(...extraFragments)

	if (fragments.length === 0) return { iface: null, source: "none", fragments: [] }
	try {
		const iface = new Interface(fragments)
		return { iface, source: verifiedAbi ? "verified" : "derived", fragments }
	} catch (_) {
		return { iface: null, source: "none", fragments: [] }
	}
}

module.exports = { resolveAbi }
