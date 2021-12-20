/**
 * index.js
 *
 * Entry point
 */

const Indexer = require('./indexer')
const Server = require('./server')
const {
  API, DB, NETWORK, PORT, FETCH_LIMIT, WORKERS, MATTERCLOUD_KEY, PLANARIA_TOKEN, START_HEIGHT,
  MEMPOOL_EXPIRATION, ZMQ_URL, RPC_URL, DEFAULT_TRUSTLIST, DEBUG, SERVE_ONLY, DATA_SOURCE, DATA_API_ROOT,
  WORKER_TRUST_SOURCE, WORKER_CACHE_TYPE
} = require('./config')
const MatterCloud = require('./mattercloud')
const Planaria = require('./planaria')
const RunConnectFetcher = require('./run-connect')
const BitcoinNodeConnection = require('./bitcoin-node-connection')
const BitcoinRpc = require('./bitcoin-rpc')
const BitcoinZmq = require('./bitcoin-zmq')
const Database = require('./database')
const DirectServer = require('./direct-server')
const { SqliteDatasource } = require('./data-sources/sqlite-datasource')
const { SqliteMixedDatasource } = require('./data-sources/sqlite-mixed-datasource')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const logger = {}
logger.info = console.info.bind(console)
logger.warn = console.warn.bind(console)
logger.error = console.error.bind(console)
logger.debug = DEBUG ? console.debug.bind(console) : () => {}

let api = null
switch (API) {
  case 'mattercloud': api = new MatterCloud(MATTERCLOUD_KEY, logger); break
  case 'planaria': api = new Planaria(PLANARIA_TOKEN, logger); break
  case 'bitcoin-node':
    if (ZMQ_URL === null) {
      throw new Error('please specify ZQM_URL when using bitcoin-node API')
    }

    if (RPC_URL === null) {
      throw new Error('please specify RPC_URL when using bitcoin-node API')
    }
    api = new BitcoinNodeConnection(new BitcoinZmq(ZMQ_URL), new BitcoinRpc(RPC_URL))
    break
  case 'run': api = new RunConnectFetcher(); break
  case 'none': api = {}; break
  default: throw new Error(`Unknown API: ${API}`)
}

const readonly = !!SERVE_ONLY

let dataSource
if (DATA_SOURCE === 'sqlite') {
  dataSource = new SqliteDatasource(DB, logger, readonly)
} else if (DATA_SOURCE === 'mixed') {
  dataSource = new SqliteMixedDatasource(DB, logger, readonly, DATA_API_ROOT)
} else {
  throw new Error(`unknown datasource: ${DATA_SOURCE}. Please check "DATA_SOURCE" configuration.`)
}

const database = new Database(dataSource, logger)

const indexer = new Indexer(database, api, NETWORK, FETCH_LIMIT, WORKERS, logger,
  START_HEIGHT, MEMPOOL_EXPIRATION, DEFAULT_TRUSTLIST, {
    trustSource: WORKER_TRUST_SOURCE,
    cacheType: WORKER_CACHE_TYPE
  })

const server = SERVE_ONLY
  ? new Server(database, logger, PORT)
  : new DirectServer(DB, PORT, logger, database)

let started = false

// ------------------------------------------------------------------------------------------------
// main
// ------------------------------------------------------------------------------------------------

async function main () {
  await database.open()

  if (!SERVE_ONLY) {
    await indexer.start()
  }

  await server.start()

  started = true
}

// ------------------------------------------------------------------------------------------------
// shutdown
// ------------------------------------------------------------------------------------------------

async function shutdown () {
  if (!started) return

  logger.debug('Shutting down')

  started = false

  await server.stop()

  if (!SERVE_ONLY) {
    await indexer.stop()
  }

  await database.close()

  process.exit(0)
}

// ------------------------------------------------------------------------------------------------

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

main()
