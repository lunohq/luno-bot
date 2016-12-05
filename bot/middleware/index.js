import storage from 'luno-core/lib/botkit/storage'
import config from '../config/environment'
import logger from '../logger'
import * as actions from '../actions'
import statsd from '../statsd'

import expire from './expire'
import thread, { record } from './thread'
import stripped from './stripped'
import mustache from './mustache'

export {
  expire,
  thread,
  record,
  stripped,
  mustache,
}

const debug = require('debug')('bot:middleware')

export async function profile({ next }) {
  statsd.increment('bot.process.msg.received')
  const start = new Date()
  await next()
  const end = new Date()
  debug('Finished processing request: %sms', (end - start) / 1000)
}

export async function highAvailability({ ctx, message, next }) {
  if (!message.ts) {
    return next()
  }

  const { bot: { identity: { id: botId } } } = ctx
  const payload = { botId, ts: message.ts }
  if (message.channel) {
    payload.channel = message.channel
  } else if (message.item) {
    payload.channel = message.item.channel
  }

  try {
    debug('Claiming message', payload)
    await storage.mutex.lockMessage(payload, 60000)
    return next()
  } catch (err) {
    debug('Another bot is processing message', payload)
  }
  return null
}

export async function firehose({ ctx, message, next }) {
  if (message.type && !config.firehose.events.exclude.includes(message.type)) {
    const { identities: { bot: { id: botId }, team: { id: teamId } } } = ctx
    try {
      actions.writeToStream({ botId, message, teamId })
        .catch(err => {
          if (err.code !== 'ResourceNotFoundException') {
            logger.error('Error writing data to stream', { ctx, message, err })
          }
        })
        .then(() => debug('Wrote event to firehose', { ctx, message }))
    } catch (err) {
      logger.error('Error writing data to stream', { ctx, message, err })
    }
  }
  return next()
}

export async function categorize({ message, next }) {
  let dm = message.event && message.event.startsWith('direct_message')
  if (!dm && message.item && message.item.channel && message.item.channel.startsWith('D')) {
    dm = true
  }
  message._dm = dm
  return next()
}

/**
 *
 * Support translating a message from a bot into something that looks like it
 * was sent from a user.
 *
 * If a bot is posting without `as_user` = True, there will be no `user` field
 * on the message. We look for this field in several places, so for our
 * purposes, we'll create a `user` field based on the info about the bot and
* the message being sent for compatability
 *
 */
export async function botMessages({ message, next }) {
  function clean(obj) {
    Object.keys(obj).forEach(key => {
      const value = obj[key]
      if (!key.startsWith('_') && (value === null || value === '')) {
        delete obj[key]
      } else if (typeof value === 'object') {
        clean(value)
      }
    })
  }

  if (!message.user && message.bot_id) {
    message.user = message.bot_id
    if (message.username) {
      message.user = `${message.user}${message.username.replace(/[ ,.]/g, '')}`
    }

    // Bot messages can contain empty values within `user_profile` and other
    // fields that we want to clean out.
    clean(message)
    if (message.text === undefined) {
      message.text = ''
    }
  }
  return next()
}
