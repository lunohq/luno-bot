import StatsD from 'hot-shots'

import config from './config/environment'
import logger, { processId } from './logger'

const client = new StatsD({
  host: config.datadog.host,
  globalTags: [`stage:${process.env.STAGE}`, `env:${process.env.NODE_ENV}`, `process_id:${processId}`],
  mock: !config.datadog.enabled,
})

client.socket.on('error', (err) => {
  logger.error('Error with statsd socket', { err })
})

export default client
