import winston from 'winston'
import RavenWinston from 'raven-winston'

import config from './config/environment'

function rewriteError(level, msg, meta) {
  const output = {}
  if (meta instanceof Error) {
    output.err = {
      stack: meta.stack,
      message: meta.message,
      extra: meta.extra,
    }
    return output
  }
  Object.assign(output, meta)
  if (meta.err && typeof meta.err === 'object') {
    output.err = {
      stack: meta.err.stack,
      message: meta.err.message,
      extra: meta.err.extra,
    }
  }
  return output
}

function rewriteCtx(level, msg, meta) {
  const output = {}
  const { ctx, ...other } = meta
  Object.assign(output, other)
  if (ctx) {
    output.ctx = {}
    const { team } = ctx
    if (team) {
      output.ctx.team = {
        id: team.id,
        name: team.name,
      }
    }
    const { bot } = ctx
    if (bot) {
      const { identity } = bot
      if (identity) {
        output.ctx.bot = {
          id: identity.id,
          name: identity.name,
        }
      }
    }
    const { message } = ctx
    if (message) {
      output.ctx.message = message
    }
  }
  return output
}

function rewriteMessage(level, msg, meta) {
  const output = {}
  const { message, ...other } = meta
  Object.assign(output, other)
  if (message) {
    const { _thread: thread, ...m } = message
    output.message = { ...m }
    if (thread) {
      const { model, events } = thread
      output.message.thread = {
        model,
        events,
      }
    }
  }
  return output
}

function rewriteBot(level, msg, meta) {
  const output = {}
  const { bot, ...other } = meta
  Object.assign(output, other)
  if (bot) {
    const { team } = bot
    if (team) {
      const { id, name } = team
      output.bot = { team: { id, name } }
    }
  }
  return output
}

export const processId = (Math.random() * 1e20).toString(36)
const context = { processId }
const logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: config.winston.logger.console.level,
      depth: config.winston.logger.console.depth,
      prettyPrint: config.winston.logger.console.prettyPrint,
    }),
  ],
})

logger.log = function log(...args) {
  const meta = args[2] || {}
  args[2] = Object.assign(meta, context)
  winston.Logger.prototype.log.apply(this, args)
}

if (config.env !== 'local') {
  logger.add(RavenWinston, { dsn: config.sentry.dsn, patchGlobal: true, level: 'warn' })
}

logger.rewriters.push(rewriteError)
logger.rewriters.push(rewriteCtx)
logger.rewriters.push(rewriteMessage)
logger.rewriters.push(rewriteBot)

export default logger
