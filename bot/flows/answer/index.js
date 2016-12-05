import {
  EVENT_ANSWER_FLOW,
  EVENT_SMART_ANSWER,
  EVENT_NO_RESULTS,
  EVENT_MULTIPLE_RESULTS,
  EVENT_CLARIFICATION,
} from 'luno-core/lib/db/thread'
import storage from 'luno-core/lib/botkit/storage'
import { db } from 'luno-core'
import logger from '../../logger'
import {
  promptToEscalate,
  search,
  replyWithExample,
  getSummonName,
} from '../../actions'
import { log, receive } from '../../middleware/thread'
import { expireMessage } from '../../middleware/expire'
import tracker from '../../tracker'
import getResponse from './getResponse'

const debug = require('debug')('bot:flows:answer')

async function askForFeedback({ ctx, message }) {
  const { bot } = ctx

  // There seems to be a lag between when the RTM message is created and us
  // being able to react to it. We were getting "message_not_found" errors
  // occassionally when trying to provide thumbs up to this, even though the
  // RTM message is sent and we have a valid timestamp. Passing empty
  // attachments causes the message to be sent by the web api.
  const feedbackMessage = await bot.replyWithTyping(
    message,
    { text: '_Was this helpful? Click thumbs up or thumbs down._', attachments: [] },
  )

  // expire the request so we don't send any more typing indicators
  expireMessage(message)

  try {
    await storage.reactions.listenTo(feedbackMessage)
  } catch (err) {
    logger.error('Failed to register listener', { ctx, feedbackMessage, err })
  }

  try {
    await bot.api.reactions.add('thumbsup', {
      timestamp: feedbackMessage.ts,
      channel: feedbackMessage.channel,
    })
  } catch (err) {
    logger.error('Failed to provide thumbs up feedback loop', { ctx, feedbackMessage, err })
  }

  try {
    await bot.api.reactions.add('thumbsdown', {
      timestamp: feedbackMessage.ts,
      channel: feedbackMessage.channel,
    })
  } catch (err) {
    logger.error('Failed to provide thumbs down feedback loop', { ctx, feedbackMessage, err })
  }
}

function askForClarification({ ctx, message }) {
  log({ message, event: { type: EVENT_CLARIFICATION } })

  let summoning = '@mentioning '
  if (message._dm) {
    summoning = 'messaging'
  }
  const response = `Sorry, I didn\'t quite understand that. Can you simplify it for me by ${summoning} me with just a few keywords?`
  return replyWithExample({ ctx, message, response })
}

function reportMultipleResults({ ctx, message, total, hits, response, took = 0 }) {
  tracker.trackMultipleResults({ ctx, message, total })
  const event = { type: EVENT_MULTIPLE_RESULTS, meta: { hits, took } }
  log({ message, event })
  return ctx.bot.replyWithTyping(message, response)
}

async function reportSingleResult({ ctx, message, hits, response, took = 0 }) {
  const { bot, identities: { team: { id: teamId } } } = ctx
  const event = { type: EVENT_SMART_ANSWER, meta: { hit: hits[0], took } }
  log({ message, event })
  await bot.replyWithTyping(message, response)
  const admins = await db.user.getAdmins(teamId)
  const userIds = admins.map(user => user.id)
  if (!userIds.includes(message.user) && !message.subtype) {
    await askForFeedback({ ctx, message })
  }
}

async function handleNoResult({ ctx, message, query }) {
  log({ message, event: { type: EVENT_NO_RESULTS } })
  const responses = {
    prompt: ':disappointed: Sorry, I haven\'t been trained on that yet. Do you want me to get someone who can help?',
    dm: 'Sure thing. I\'ll setup a group chat with {{{pointsOfContactAnd}}}',
    mpim: `{{{pointsOfContactOr}}} - <@${message.user}> needs help with \`${query}\` and I couldn't find anything.`,
    channel: `{{{pointsOfContactOr}}} can you help <@${message.user}> with \`${query}\`?`,
  }
  await promptToEscalate({ ctx, message, responses })
}

export async function handleResults({ ctx, message, results }) {
  const summonName = getSummonName({ ctx, message })
  debug('Handling results', results)
  const { took, tiers } = results
  const { meta, ...payload } = getResponse({ results: tiers, summon: summonName })
  if (meta && meta.total && meta.total > 1) {
    return reportMultipleResults({
      ctx,
      message,
      took,
      response: payload,
      total: meta.total,
      hits: meta.hits,
    })
  }
  return reportSingleResult({
    ctx,
    message,
    took,
    response: payload,
    total: meta.total,
    hits: meta.hits,
  })
}

export default async function answer({ ctx, message, shouldReceive }) {
  if (shouldReceive !== false) {
    receive({ ctx, message })
  }
  log({ message, event: { type: EVENT_ANSWER_FLOW, meta: { query: message.text } } })

  const query = message.text
  const words = query.split(' ')
  if (words.length > 20) {
    tracker.trackAskForClarification({ ctx, message, length: words.length })
    return await askForClarification({ ctx, message })
  }

  let results
  let remainingRetries = 3
  let hasSentUpdate = false
  let requestTimeout = 500
  const { bot } = ctx

  while (!results) {
    try {
      results = await search({ teamId: bot.team.id, query, options: { requestTimeout } })
    } catch (err) {
      if (remainingRetries) {
        if (!hasSentUpdate) {
          await bot.replyWithTyping(message, 'Hang on, I\'m working on it...')
          hasSentUpdate = true
        }
        requestTimeout += 1500
        remainingRetries--
        logger.warn('Retrying search request', { ctx, remainingRetries, requestTimeout, message })
      } else {
        throw err
      }
    }
  }

  results.tiers.forEach((tier, index) => {
    debug(`Tier: ${index}`, tier.hits)
  })
  let response
  if (results.hasResults) {
    response = await handleResults({ ctx, message, results })
  } else {
    tracker.trackNoResults({ ctx, message, query })
    response = await handleNoResult({ ctx, message, query })
  }
  return response
}
