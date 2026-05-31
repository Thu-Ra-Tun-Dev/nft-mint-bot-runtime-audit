// SimulateLoop — auto-simulate until sale opens, bounded by openWaitMs (no infinite loop)
// sale ဖွင့်တဲ့အထိ simulate poll၊ openWaitMs deadline နဲ့ ကန့်သတ် (infinite loop မဖြစ်စေ)

const { simulateCandidate } = require("../phase/simulationProbe")
const config = require("../config/settings")
const logger = require("../logger/logger")

const DEFAULT_OPEN_WAIT_MS = 120_000 // fallback if config.retry.openWaitMs unset / config မရှိရင် fallback
const DEFAULT_POLL_INTERVAL_MS = 750  // closed-state base poll interval / ပိတ်နေစဉ် poll

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// decide open vs closed from a simulation result / sim result ကနေ open/closed
function isOpenFrom(result) {
	if (!result) return false
	if (result.success) return true // eth_call succeeded -> open / အောင်ရင် open
	const cls = result.classification
	// gating revert (open but our proof/sig/limit unmet) still means the sale is OPEN
	// gate revert = sale ဖွင့်ပြီး၊ proof/sig မမှန်ရုံ -> open လို့ယူ
	if (cls && cls.matched && cls.saleOpen === true) return true
	if (cls && cls.saleOpen === false) return false // explicit closed/paused -> still closed
	return false // unknown -> treat closed, keep polling / မသိရင် ပိတ်လို့ယူ
}

// poll until open OR deadline OR manual stop / open/deadline/stop အထိ poll
async function waitForOpen(ctx, control, options = {}) {
	const openWaitMs = options.openWaitMs || (config.retry && config.retry.openWaitMs) || DEFAULT_OPEN_WAIT_MS
	const pollMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS
	const from = options.from || null

	const deadline = Date.now() + openWaitMs
	let polls = 0
	let last = null

  // SeaDrop PUBLIC: openness already established authoritatively by getPublicDrop's live-window
  // (statePhaseProbe guard). The mintPublic eth_call is NOT a valid open-oracle — it reverts
  // data-less ("missing revert data") even when live — so bypass the poll entirely for SeaDrop.
  // SeaDrop ဆို getPublicDrop live guard က open ဖြစ်ပြီးသား — mintPublic eth_call ကို open oracle မသုံး
  if (ctx && ctx.seaDrop) {
    logger.tx("[retry] SeaDrop public window live at detection -> OPEN (bypass mint eth_call probe)")
    return { open: true, reason: "seadrop-window", polls: 0, last: null }
  }

	while (true) {
		if (control && control.stopped) return { open: false, reason: "stopped", polls, last }
		if (Date.now() >= deadline) {
			logger.warn(`[retry] open-wait timeout after ${polls} poll(s)`)
			return { open: false, reason: "timeout", polls, last }
		}

		polls++
		try {
			// probe with the SAME args/value the spam path will broadcast, so OPEN detection is accurate
			// spam က ပို့မယ့် args/value အတိုင်း probe (placeholder မဟုတ်) -> OPEN detection မှန်
			last = await simulateCandidate(ctx.primary, ctx.target, from, { args: ctx.args, value: ctx.value })
         console.log("[SIM RESULT]", last)
			if (isOpenFrom(last)) {
				logger.tx(`[retry] sale OPEN detected (poll ${polls})`)
				return { open: true, reason: "open", polls, last }
			}
		} catch (e) {
			// transient RPC error -> keep polling, not a closed signal / RPC error -> ဆက် poll
			logger.debug(`[retry] simulate poll error: ${e && e.message}`)
		}
		await sleep(pollMs)
	}
}

module.exports = { waitForOpen, isOpenFrom }
