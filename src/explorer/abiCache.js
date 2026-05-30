// AbiCache — in-memory LRU + on-disk JSON + negative cache (TTL)
// Termux-safe: bounded memory + atomic disk writes (tmp → rename)

const fsp = require("fs/promises")
const path = require("path")
const { getAddress } = require("ethers")
const logger = require("../logger/logger")

function safeKey(chainId, address) {
  let addr
  try {
    addr = getAddress(address)
  } catch (_) {
    addr = String(address)
  }
  return `${chainId}:${addr}`
}

function createAbiCache({ cacheDir = ".cache/abi", maxMemoryEntries = 100, negativeTtlMs = 300000 } = {}) {
  const mem = new Map() // insertion-order LRU

  function memGet(key) {
    if (!mem.has(key)) return undefined
    const entry = mem.get(key)
    mem.delete(key)
    mem.set(key, entry) // refresh recency / recency အသစ်
    return entry
  }

  function memSet(key, entry) {
    if (mem.has(key)) mem.delete(key)
    mem.set(key, entry)
    while (mem.size > maxMemoryEntries) mem.delete(mem.keys().next().value) // evict oldest
  }

  function diskPath(key) {
    const safe = key.replace(/:/g, "-").replace(/[^a-zA-Z0-9_.-]/g, "_")
    return path.join(cacheDir, `${safe}.json`)
  }

  async function ensureDir() {
    try {
      await fsp.mkdir(cacheDir, { recursive: true })
    } catch (err) {
      logger.warn(`[abiCache] mkdir failed: ${err.message}`)
    }
  }

  async function get(chainId, address) {
    const key = safeKey(chainId, address)
    const m = memGet(key)
    if (m) {
      if (m.negative && Date.now() > m.expiresAt) mem.delete(key)
      else return m
    }
    try {
      const entry = JSON.parse(await fsp.readFile(diskPath(key), "utf8"))
      if (entry.negative && Date.now() > entry.expiresAt) return undefined
      memSet(key, entry)
      return entry
    } catch (_) {
      return undefined
    }
  }

  async function writeDisk(key, entry) {
    await ensureDir()
    const file = diskPath(key)
    const tmp = `${file}.${process.pid}.tmp`
    try {
      await fsp.writeFile(tmp, JSON.stringify(entry), "utf8")
      await fsp.rename(tmp, file) // atomic on same fs / atomic
    } catch (err) {
      logger.warn(`[abiCache] write failed: ${err.message}`)
      try {
        await fsp.unlink(tmp)
      } catch (_) {}
    }
  }

  async function setPositive(chainId, address, abi, meta = {}) {
    const key = safeKey(chainId, address)
    const entry = { negative: false, abi, meta, savedAt: Date.now() }
    memSet(key, entry)
    await writeDisk(key, entry)
  }

  async function setNegative(chainId, address) {
    const key = safeKey(chainId, address)
    const entry = { negative: true, expiresAt: Date.now() + negativeTtlMs, savedAt: Date.now() }
    memSet(key, entry)
    await writeDisk(key, entry)
  }

  function clear() {
    mem.clear()
  }

  return { get, setPositive, setNegative, clear }
}

module.exports = { createAbiCache }
