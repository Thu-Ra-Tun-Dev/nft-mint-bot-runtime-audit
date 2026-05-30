// Explorer entry — shared singleton (matches rpc/logger convention)
// explorer singleton — config ကနေ wired
const { createExplorerService } = require("./explorerService")

const explorer = createExplorerService()

module.exports = { explorer, createExplorerService }
