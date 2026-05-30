// Platform entry — AnalysisResult (P11) -> PlatformVerdict (advisory hint for detector/phase)
// AnalysisResult ကို PlatformVerdict ပြောင်း (detector/phase အတွက် advisory hint)
// Advisory only: detector (P12) / phase (P14) stay fully dynamic; verdict only biases confidence.
// Advisory သာ: detector/phase က dynamic အတိုင်း၊ verdict က confidence ကိုသာ bias

const { recognizePlatform } = require("./platformRecognizer")
const { FINGERPRINTS, BY_PLATFORM } = require("./fingerprintDB")

module.exports = {
	recognizePlatform,
	FINGERPRINTS,
	BY_PLATFORM,
}
