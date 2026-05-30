// RateLimiter — token-bucket throttle to respect explorer RPS
// token-bucket — Termux-safe: bounded queue + .unref()'d refill timer

function createRateLimiter({ rps = 5, maxQueue = 256 } = {}) {
  const capacity = Math.max(1, rps)
  let tokens = capacity
  const queue = []

  const refill = setInterval(() => {
    tokens = capacity
    while (tokens > 0 && queue.length > 0) {
      tokens--
      queue.shift()()
    }
  }, 1000)
  if (typeof refill.unref === "function") refill.unref() // process ကို alive မထား

  // token တခုယူ၊ မရှိရင် queue / acquire a token (await if empty)
  function acquire() {
    if (tokens > 0) {
      tokens--
      return Promise.resolve()
    }
    if (queue.length >= maxQueue) return Promise.reject(new Error("rate limiter queue full"))
    return new Promise((resolve) => queue.push(resolve))
  }

  function destroy() {
    clearInterval(refill)
    queue.length = 0
  }

  return { acquire, destroy }
}

module.exports = { createRateLimiter }
