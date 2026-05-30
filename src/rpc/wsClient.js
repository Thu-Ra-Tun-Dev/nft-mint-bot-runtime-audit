// WebSocket client — self-healing ws provider (reconnect + heartbeat)
// ws ပြုတ်သွားရင် အလိုအလျောက်ပြန်ဆက်၊ heartbeat နဲ့ ထိန်းသိမှုစစ်

const { WebSocketProvider } = require("ethers")
const WebSocket = require("ws")
const logger = require("../logger/logger")
const { HEARTBEAT_INTERVAL_MS, WS_RECONNECT_MAX_MS } = require("../config/constants")

class WsClient {
	constructor(url) {
		this.url = url
		this.provider = null
		this.socket = null
		this.alive = false
		this.reconnecting = false
		this.reconnectDelay = 500
		this.heartbeatTimer = null
		this._connect()
	}

	// create socket + provider, wire reconnect events / socket+provider ဆောက်
	_connect() {
		const socket = new WebSocket(this.url)
		this.socket = socket

		socket.on("open", () => {
			this.alive = true
			this.reconnectDelay = 500 // reset backoff on success / အောင်ရင် backoff reset
			logger.info(`[ws] connected ${this.url}`)
			this._startHeartbeat()
		})
		socket.on("close", () => this._onDrop("close"))
		socket.on("error", (err) => this._onDrop(`error:${err && err.message}`))

		// hand the live socket to ethers / socket ကို ethers ဆီပေး
		this.provider = new WebSocketProvider(socket)
	}

	// drop handler — capped exponential backoff reconnect
	_onDrop(reason) {
		if (this.reconnecting) return // double-trigger မဖြစ်အောင်
		this.reconnecting = true
		this.alive = false
		this._stopHeartbeat()
		logger.warn(`[ws] dropped (${reason}); reconnect in ${this.reconnectDelay}ms`)
		try { this.provider && this.provider.destroy() } catch (_) {}
		try { this.socket && this.socket.terminate() } catch (_) {}
		const delay = this.reconnectDelay
		// snipe speed — backoff ကို cap ထား
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, WS_RECONNECT_MAX_MS)
		setTimeout(() => {
			this.reconnecting = false
			this._connect()
		}, delay)
	}

	// heartbeat — silent-death detect via block number ping / တိတ်ဆိတ်သေတာဖမ်း
	_startHeartbeat() {
		this._stopHeartbeat()
		this.heartbeatTimer = setInterval(async () => {
			try {
				await this.provider.getBlockNumber()
			} catch (_) {
				this._onDrop("heartbeat")
			}
		}, HEARTBEAT_INTERVAL_MS)
	}

	_stopHeartbeat() {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
		this.heartbeatTimer = null
	}

	getProvider() { return this.provider }
	isAlive() { return this.alive && this.provider !== null }

	destroy() {
		this._stopHeartbeat()
		try { this.provider && this.provider.destroy() } catch (_) {}
		try { this.socket && this.socket.terminate() } catch (_) {}
		this.provider = null
		this.socket = null
		this.alive = false
	}
}

module.exports = WsClient
