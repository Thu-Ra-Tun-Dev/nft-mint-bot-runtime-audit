// TX Builder entry — public surface for assembling sign-ready transactions
// tx builder အတွက် public entry (buildTxRequest + createCalldata)

const { buildTxRequest } = require("./txBuilder")
const { buildCalldata } = require("./calldataBuilder")
const { simulateTx } = require("./txSimulator")

// createCalldata — thin alias for direct calldata encode / calldata တိုႀုက်လုပ်ခ်င်ရင်
function createCalldata(args) {
	return buildCalldata(args)
}

module.exports = { buildTxRequest, buildCalldata, createCalldata, simulateTx }
