import os from 'os'
import { Controller } from 'converse'
import identities from 'converse/lib/contrib/middleware/receive/identities'
import events from 'converse/lib/contrib/middleware/receive/events'
import core from 'luno-core'
import memwatch from 'memwatch-next'

import statsd from './statsd'
import config from './config/environment'
import logger from './logger'
import flows from './flows/middleware'
import { ensureDeliveryStream } from './actions'
import * as middleware from './middleware'

const debug = require('debug')('bot')

let hd
memwatch.on('leak', info => {
  logger.error('Memory Leak Detected', { info })
  if (!hd) {
    hd = new memwatch.HeapDiff()
  } else {
    logger.warn('Attempting to write heapdiff')
    try {
      const diff = hd.end()
      logger.error('Memory Leak Heap Diff', { diff })
    } catch (err) {
      logger.error('Error writing heap diff', { err })
    }
    hd = null
  }
})

async function getTeam(id) {
  debug('Fetching team', id)
  const options = { ConsistentRead: true }
  const [team, bots] = await Promise.all([
    core.db.team.getTeam(id, options),
    core.db.bot.getBots(id, options),
  ])
  const { slack, ...other } = team
  const response = {
    token: slack.bot.token,
    userId: slack.bot.userId,
    bot: bots[0],
    ...other,
  }
  if (!response.bot) {
    throw new Error('No bot found when fetching team')
  }
  debug('Fetched team', response)
  return response
}

function getParams(bot, data) {
  let message = data
  if (typeof message === 'object') {
    if (message.err && message.code) {
      message = `${message.err}: ${message.code}`
    } else {
      message = JSON.stringify(data)
    }
  }
  return {
    message,
    hostname: os.hostname(),
    tags: [`team_id:${bot.team.id}`],
  }
}

function check({ bot, data, level }) {
  const { tags, ...options } = getParams(bot, data)
  statsd.check(
    config.datadog.botServiceCheck,
    level,
    options,
    tags,
    err => {
      if (err) logger.error('Error recording service check', { err, bot, data, level })
    },
  )
}

function handleWarning({ bot, ...data }) {
  statsd.increment('bot.warning')
  check({ bot, data, level: statsd.CHECKS.WARNING })
}

function handleDisconnect({ bot, ...data }) {
  statsd.increment('bot.disconnect')
  check({ bot, data, level: statsd.CHECKS.CRITICAL })
}

function handleHealthy(bot) {
  check({ bot, data: 'Pong', level: statsd.CHECKS.OK })
}

function handleConnect(bot) {
  statsd.increment('bot.connect')
  check({ bot, data: 'Connected', level: statsd.CHECKS.OK })
}

async function handleInactive(teamId) {
  logger.info(`Deactivating team: ${teamId}`)
  try {
    await core.db.team.deactivateTeam(teamId)
  } catch (err) {
    logger.error('Error deactivating team', { teamId, err })
  }
}

const controller = new Controller({
  getTeam,
  logger,
  onInactive: handleInactive,
  onWarning: handleWarning,
  onHealthy: handleHealthy,
  onDisconnect: handleDisconnect,
  onConnect: handleConnect,
  botConfig: {
    dataStoreOpts: {
      redisOpts: { host: process.env.REDIS_HOST },
    },
  },
})

// Register for distributed events

async function mustCreateBot(teamId, retries = 0) {
  if (retries > config.maxConnectionRetries) {
    throw new Error('Exceeded max connection retries')
  }

  debug('Attempting to connect bot', { teamId })
  let bot
  try {
    bot = await controller.spawn(teamId)
  } catch (err) {
    logger.error('Error connecting bot, retrying...', { teamId, err })
    return new Promise(resolve => setTimeout(() => resolve(mustCreateBot(teamId, retries + 1)), 1000))
  }
  return bot
}

core.events.handle.createBot(async (teamId) => {
  debug('Received request to create bot', { teamId })
  let bot
  try {
    bot = await mustCreateBot(teamId)
  } catch (err) {
    logger.error('Error creating bot', { teamId, err })
    return
  }

  if (bot.team.status === core.db.team.STATUS_INACTIVE) {
    debug('Reactivating team', { teamId })
    try {
      await core.db.team.activateTeam(teamId)
    } catch (err) {
      logger.error('Error reactivating team', { teamId, err })
    }
  }
  debug('Bot created', { teamId })
})

core.events.handle.createTeam(async (teamId) => {
  debug('Received request to create team', { teamId })
  try {
    await mustCreateBot(teamId)
  } catch (err) {
    logger.error('Error connecting team', { teamId, err })
    return
  }
})

core.events.handle.createUser(async (payload) => {
  debug('Received request to create user', { payload })
  let data
  try {
    data = JSON.parse(payload)
  } catch (err) {
    logger.error('Error parsing create user payload', { payload, err })
    return
  }

  let bot
  try {
    bot = await mustCreateBot(data.teamId)
  } catch (err) {
    logger.error('Error connecting team', { data, err })
    return
  }

  bot.receive({ event: 'new_user', ...data })
  debug('Processed create user', data)
})

// Register Middleware

controller.middleware.spawn.use(async ({ team, next }) => {
  if (config.middleware.firehose.enabled) {
    try {
      await ensureDeliveryStream(team)
    } catch (err) {
      logger.error('Error ensuring delivery stream', { team, err })
    }
  }
  return next()
})

controller.middleware.receive.use(middleware.profile)
controller.middleware.receive.use(identities)
controller.middleware.receive.use(events)
controller.middleware.receive.use(middleware.highAvailability)
controller.middleware.receive.use(middleware.stripped)
controller.middleware.receive.use(middleware.botMessages)

// NB: If we change threading to write to a redis queue, we need to rethink how we
// log to the firehose after we resume processing the event
controller.middleware.receive.use(middleware.thread)
controller.middleware.receive.use(middleware.categorize)
if (config.middleware.firehose.enabled) {
  controller.middleware.receive.use(middleware.firehose)
}
controller.middleware.receive.use(flows)
controller.middleware.send.use(middleware.mustache)
controller.middleware.send.use(middleware.expire)
controller.middleware.sent.use(middleware.record)

function reflect(teamId, promise) {
  return promise.then(value => ({
    value,
    teamId,
    status: 'resolved',
  }), err => {
    if (typeof err === 'object') {
      err = {
        stack: err.stack,
        message: err.message,
      }
    }
    return {
      err,
      teamId,
      status: 'rejected',
    }
  })
}

controller.start().then(async () => {
  debug('Starting controller')
  if (process.env.SINGLE_TEAM) {
    debug('!! Connecting single team')
    controller.spawn(process.env.SINGLE_TEAM)
  } else {
    const teams = await core.db.team.getTeams()
    const promises = []
    for (const team of teams) {
      if (team.status !== core.db.team.STATUS_INACTIVE && team.slack && team.slack.bot) {
        // TODO: optimize not refetching the team here
        const promise = controller.spawn(team.id)
        promises.push(reflect(team.id, promise))
      } else {
        logger.info(`Not attempting connection for inactive team: ${team.id}`)
      }
    }
    Promise.all(promises).then((results) => {
      const successful = []
      const failed = []
      for (const result of results) {
        if (result.status === 'resolved') {
          successful.push(result)
        } else {
          failed.push(result)
        }
      }
      const now = new Date().toISOString()
      const message = `Startup: ${process.env.EMPIRE_RELEASE} ${now}
      - attempted to spawn ${results.length} bots
      - connected ${successful.length} bots
      - ${failed.length} failed
      `
      logger.info(message)
      if (failed.length) {
        logger.error('Failed to connect bots on startup', failed)
      }
    })
    logger.info(`Spawned bots for ${teams.length} teams`)
  }
}).catch(err => {
  logger.error('Error starting controller', err)
  process.exit(1)
})
