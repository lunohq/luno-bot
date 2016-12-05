import { EVENT_FEEDBACK, EVENT_SMART_ANSWER, EVENT_ANSWER_FLOW } from 'luno-core/lib/db/thread'
import Flow, { run } from './Flow'
import storage from 'luno-core/lib/botkit/storage'
import logger from '../logger'
import tracker from '../tracker'
import { log, receive } from '../middleware/thread'
import { promptToEscalate } from '../actions'

const debug = require('debug')('bot:flows:Feedback')

async function positiveFeedback({ ctx, message, item, shouldRespond }) {
  const { bot } = ctx
  const { channel, ts } = item
  debug('Positive feedback, removing negative reaction', { channel })
  bot.api.reactions.remove('-1', { channel, timestamp: ts })
    .catch(err => logger.warn('Error removing reaction', { ctx, item, err }))

  storage.reactions.clear(item)
  if (shouldRespond) {
    debug('Responding to feedback')
    await bot.replyWithTyping({ channel, _thread: message._thread }, 'Glad I could help :simple_smile:')
  } else {
    debug('Not responding to feedback')
  }
}

async function negativeFeedback({ ctx, message, item, shouldRespond }) {
  const { bot } = ctx
  const { channel, ts } = item
  const answer = message._thread.getLastEventOfType(EVENT_SMART_ANSWER)
  const { meta: { query } } = message._thread.getLastEventOfType(EVENT_ANSWER_FLOW)

  debug('Negative feedback, removing positive reaction', { channel })
  bot.api.reactions.remove('+1', { channel, timestamp: ts })
    .catch(err => logger.error('Error removing reaction', { ctx, item, err }))

  storage.reactions.clear(item)
  if (!shouldRespond) {
    debug('Not responding to feedback')
    return
  }

  debug('Responding to feedback')
  bot.startTyping({ channel })
  const responses = {
    prompt: 'Sorry I couldn\'t find what you were looking for. Do you want me to get someone who can help?',
    dm: 'Sure thing. I\'ll setup a group chat with {{{pointsOfContactAnd}}}.',
    channel: `{{{pointsOfContactOr}}} - can you help <@${message.user}>?`,
    mpim: `{{{pointsOfContactOr}}} - <@${message.user}> needs help with \`${query}\` and *${answer.meta.hit._source.title}* wasn't helpful.`,
  }
  // override the message channel so it works like a normal received message
  const temp = Object.assign({}, message, { channel })
  await promptToEscalate({ ctx, message: temp, responses })
}

export async function feedback({ ctx, message }) {
  const { bot } = ctx
  /*eslint-disable camelcase*/
  const { item, reaction, user, item_user, _thread: thread } = message
  /*eslint-enable camelcase*/

  if (user === bot.identity.id) return

  const shouldRespond = await storage.reactions.shouldRespond(item)
  /*eslint-disable camelcase*/
  const shouldInteract = item_user === bot.identity.id && thread && thread.model.userId === user
  /*eslint-enable camelcase*/

  if (shouldInteract) {
    const positive = reaction === '+1'
    receive({ ctx, message })
    log({ message, event: { type: EVENT_FEEDBACK, meta: { positive } } })
    tracker.trackFeedback({ ctx, message, positive, responding: shouldRespond })
    if (reaction === '+1') {
      await positiveFeedback({ ctx, message, item, shouldRespond })
    } else if (reaction === '-1') {
      await negativeFeedback({ ctx, message, item, shouldRespond })
    }
  }
}

class Feedback extends Flow {

  events = ['reaction_added']
  match = async ({ message }) => this.events.includes(message.type)

  run = async ({ message, ctx }) => run({
    fn: feedback,
    ctx,
    message,
    informOnTimeout: false,
    informOnError: false,
    closeOnComplete: false,
    newThreadOnStart: false,
    typing: false,
  })
}

export default Feedback
