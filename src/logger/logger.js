// Lightweight logger — console + file, no external deps (Termux low-memory safe)
// External library မသုံးဘဲ console + file ကိုရေး၊ memory သက်သာ

const fs = require("fs")
const path = require("path")
const config = require("../config/settings")

// log level priority / level အဆင့်သတ်မှတ်
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const activeLevel = LEVELS[config.logging.level] || LEVELS.info

// logs dir — auto create once at load / logs folder အလိုအလျောက်ဆောက်
const LOG_DIR = path.resolve(process.cwd(), "logs")
if (config.logging.toFile && !fs.existsSync(LOG_DIR)) {
	fs.mkdirSync(LOG_DIR, { recursive: true })
}

// reuse append streams — reopen မလုပ်ဘဲ IO/memory သက်သာ
const streams = {}
function getStream(file) {
	if (!streams[file]) {
		streams[file] = fs.createWriteStream(path.join(LOG_DIR, file), { flags: "a" })
	}
	return streams[file]
}

// ISO timestamp / အချိန်တံဆိပ်
function ts() {
	return new Date().toISOString()
}

// safe format — object→JSON, error→stack / format ဘေးကင်းအောင်
function format(args) {
	return args
		.map((a) => {
			if (a instanceof Error) return a.stack || a.message
			if (a && typeof a === "object") {
				try { return JSON.stringify(a) } catch (_) { return String(a) }
			}
			return String(a)
		})
		.join(" ")
}

// safe append — file IO fail ဖြစ်လည်း bot မရပ်စေရ
function writeFile(file, line) {
	if (!config.logging.toFile) return
	try {
		getStream(file).write(line + "\n")
	} catch (_) {
		// swallow — logging failure must never crash the mint loop
	}
}

// core emit — level filter → console → app.log → routed file
function emit(level, consoleFn, routedFile, args) {
	if (LEVELS[level] < activeLevel) return // filtered out / level မမီရင်ကျော်
	const line = `[${ts()}] [${level.toUpperCase()}] ${format(args)}`
	consoleFn(line)
	writeFile("app.log", line)           // app.log = all passing logs
	if (routedFile) writeFile(routedFile, line)
}

const logger = {
	debug: (...args) => emit("debug", console.debug, "debug.log", args),
	info: (...args) => emit("info", console.log, null, args),
	warn: (...args) => emit("warn", console.warn, null, args),
	error: (...args) => emit("error", console.error, "error.log", args),

	// tx() — mint-critical, always logged regardless of level / tx အမြဲမှတ်
	tx: (...args) => {
		const line = `[${ts()}] [TX] ${format(args)}`
		console.log(line)
		writeFile("app.log", line)
		writeFile("tx.log", line)
	},
}

module.exports = logger
