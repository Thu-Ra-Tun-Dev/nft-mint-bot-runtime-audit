// Keystore — load private keys → multi-wallet registry (label + address)
// private key တွေကေနေ wallet အများဆောက်၊ label နဲ့ address မှတ်ထား

const { Wallet } = require("ethers")
const config = require("../config/settings")
const logger = require("../logger/logger")

class Keystore {
	constructor() {
		// build wallet entries from config keys / config key တွေကနေ wallet ဆောက်
		this.wallets = config.wallet.privateKeys.map((pk, i) => {
			const signer = new Wallet(pk) // provider-less until connect()
			return {
				index: i,
				label: config.wallet.labels[i] || `wallet-${i}`,
				address: signer.address,
				signer,
			}
		})
		logger.info(`[wallet] loaded ${this.wallets.length} wallet(s)`)
	}

	// connect every signer to a provider / signer တွေကို provider နဲ့ချိတ်
	connect(provider) {
		for (const w of this.wallets) {
			w.signer = w.signer.connect(provider)
		}
		return this
	}

	getAll() { return this.wallets }
	primary() { return this.wallets[0] }
	getByLabel(label) { return this.wallets.find((w) => w.label === label) }
	getByAddress(addr) {
		const a = addr.toLowerCase()
		return this.wallets.find((w) => w.address.toLowerCase() === a)
	}
}

// single shared instance / တစ်ခုတည်းသုံး
module.exports = new Keystore()
