import storage from 'luno-core/lib/botkit/storage'
import {
  commitThread,
  getOrOpenThread,
  lookupThread,
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_SENT,
} from 'luno-core/lib/db/thread'
import { isEmpty } from 'lodash'

import config from '../../config/environment'
import logger from '../../logger'
import tracker from '../../tracker'

import Thread from './Thread'
import shouldTimeout from './shouldTimeout'

const debug = require('debug')('bot:middleware:thread')

const THREAD_TYPES = [
  'message',
  'reaction_added',
]

const THREAD_OPEN_EVENTS = [
  'direct_mention:message',
  'direct_message:message',
  'mention:message',
]

function shouldLock(message) {
  return (
    !(message.event && message.event.startsWith('self')) &&
    THREAD_TYPES.includes(message.type) &&
    (!message.subtype || message.subtype === 'bot_message') &&
    // ignore direct messages from slack (ie. dnd notifications etc.)
    (message.username !== 'slackbot' || (message.username === 'slackbot' && message.event !== 'direct_message:message')) &&
    (message.user !== 'USLACKBOT' || (message.user === 'USLACKBOT' && message.event !== 'direct_message:message'))
  )
}

/**
 * Helper for returning the thread from the message or a specific thread.
 *
 * Will prefer the thread explicitly passed in.
 *
 * @param {Object} message message that may have `_thread` attached
 * @param {Thread} thread thread
 * @param {Boolean} optional boolean for whether or not we must find a thread
 * @return {Thread} the active thread
 */
function getThread(message, thread, optional = false) {
  if (thread === undefined && !message._thread && !optional) {
    throw new Error('Missing thread')
  }
  return thread !== undefined ? thread : message._thread
}

/**
 * Helper for creating a thread event.
 *
 * @param {Thread} thread thread we're creating the event for
 * @param {Object} message message
 * @param {...} data extra data we're adding to the event
 * @return {Object} returns a thread event
 */
function createEvent({ thread, message, ...data }) {
  const { id: threadId, botId, channelId, userId, teamId } = thread.model
  const event = {
    threadId,
    botId,
    channelId,
    userId,
    teamId,
    ...data,
  }

  if (message) {
    if (message.ts) {
      event.messageId = message.ts
    }
    event.message = Object.assign({}, message)
    event.message.raw = event.message._raw
    for (const key in event.message) {
      if (key.startsWith('_')) {
        delete event.message[key]
      }
      // dynamodb won't let us store empty strings for values
      const value = event.message[key]
      if (value === '') {
        delete event.message[key]
      }
    }
  }
  return event
}

export function receive({ ctx, message, thread: t }) {
  const thread = getThread(message, t)
  const event = createEvent({ thread, message, type: EVENT_MESSAGE_RECEIVED })
  debug('Recording received message', { event })
  try {
    tracker.trackMessageReceived({ ctx, message })
  } catch (err) {
    logger.error('Error tracking message received', { err, ctx, message })
  }
  thread.events.push(event)
}

export function sent({ source, response: message, thread: t, optional }) {
  const thread = getThread(source, t, optional)
  if (thread) {
    const event = createEvent({ thread, message, type: EVENT_MESSAGE_SENT })
    debug('Recording sent message', { event })
    thread.events.push(event)
  }
}

export function log({ message, thread: t, event: e }) {
  const thread = getThread(message, t)
  const event = createEvent({ thread, ...e })
  debug('Recording event', { event })
  thread.events.push(event)
}

export async function commit({ message, thread: t, close }) {
  const thread = getThread(message, t)
  const shouldClose = (message && message._close) || close
  debug('Committing thread', { thread, close: shouldClose })
  return commitThread({ thread, close: shouldClose })
}

export function closeOnCommit({ message }) {
  message._close = true
}

export async function open({ ctx, message, thread: t, shouldOpen }) {
  debug('Opening thread', { message, thread: t })

  const { bot: { id: botId }, team: { id: teamId } } = ctx.identities
  const params = {
    botId,
    teamId,
    open: shouldOpen !== undefined ? shouldOpen : true,
    userId: message.user,
  }

  let lookup = false
  if (message.item && message.item.channel) {
    // we want to fetch the thread related to the original item
    params.channelId = message.item.channel
    params.messageId = message.item.ts
    params.userId = message.item_user
    lookup = true
  } else {
    params.channelId = message.channel
  }

  let mutex
  if (t) {
    // Extend the lock for the existing thread to prevent pending messages from
    // going through while we open a new thread
    try {
      mutex = await t.mutex.extend(config.thread.mutex.timeout)
    } catch (err) {
      if (err.name !== 'LockError') {
        throw err
      }
    }
  }
  if (!mutex) {
    mutex = await storage.mutex.lockThread(params, config.thread.mutex.timeout)
  }

  debug('Locked thread', { message, params })

  let response
  try {
    if (lookup) {
      response = await lookupThread(params)
    } else {
      response = await getOrOpenThread(params)
    }
  } catch (err) {
    mutex.unlock()
    throw err
  }

  debug('Fetched thread', { message, response })
  if (isEmpty(response)) {
    mutex.unlock()
    return null
  }

  const thread = new Thread({ model: response.thread, events: response.events, mutex })
  if (shouldTimeout({ message, thread })) {
    debug('Thread timed out', { message, thread })
    await commit({ thread, close: true })
  }
  message._thread = thread
  debug('Attached thread', { message, thread })
  return thread
}

export async function start({ ctx, message, thread: t }) {
  const thread = getThread(message, t)

  // NB: If the existing thread has no events, there is no reason to close it
  // and start another
  if (!thread.events || (thread.events && !thread.events.length)) {
    debug('Using existing empty thread', { thread })
    return thread
  }

  debug('Starting new thread', { thread })
  await commit({ thread, close: true })
  const response = await open({ ctx, message, thread })
  debug('Started thread', response)
  message._thread = response
  return response
}

async function lock({ ctx, message, next, shouldOpen }) {
  try {
    await open({ ctx, message, shouldOpen })
  } catch (err) {
    if (err.name === 'LockError') {
      debug('Another process has locked the thread', { ctx, message })
      setTimeout(() => lock({ ctx, message, next, shouldOpen }), config.thread.mutex.retryInterval)
      return null
    }
    throw err
  }

  if (message._thread) {
    debug('Thread locked', { message })
    await next()
    await commit({ message })
    message._thread.mutex.unlock()
    debug('Unlocked thread', { message })
  }
  return null
}

export function isOpen(message) {
  return message._thread && message._thread.open
}

export async function record({ response, source, next }) {
  sent({ source, response, optional: true })
  return next()
}

export default async function thread({ ctx, message, next }) {
  const shouldOpen = THREAD_OPEN_EVENTS.includes(message.event)
  if (shouldLock(message)) {
    try {
      return lock({ ctx, message, next, shouldOpen })
    } catch (err) {
      logger.error('Error locking thread', { ctx, message, err })
    }
  }
  return next()
}
