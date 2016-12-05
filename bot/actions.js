import AWS from 'aws-sdk'
import { db, es } from 'luno-core'
import { EVENT_ESCALATION_FLOW, EVENT_ESCALATED } from 'luno-core/lib/db/thread'
import { getSummonVerb as sv, getFormalName as fn, getSummonName as sn } from 'luno-core/lib/botkit/helpers'
import { WebClient } from '@slack/client'

import statsd from './statsd'
import logger from './logger'
import tracker from './tracker'
import config from './config/environment'
import { log } from './middleware/thread'

const debug = require('debug')('bot:actions')

export function getFormalName({ identities: { bot } }) {
  return fn(bot)
}

export function getSummonVerb(message) {
  return sv(message._dm)
}

export function getSummonName({ ctx: { identities: { bot } }, message }) {
  return sn({ bot, isDM: message._dm })
}

export async function getBotPurpose(ctx) {
  const { team: { id: teamId, bot: { id: botId } } } = ctx
  const bot = await db.bot.getBot(teamId, botId)
  return bot.purpose
}

export async function getPointsOfContact(ctx) {
  const bot = await db.bot.getBot(ctx.team.id, ctx.team.bot.id)

  const pointsOfContact = []
  if ((bot.pointsOfContact && bot.pointsOfContact.length === 0) || !bot.pointsOfContact) {
    const users = await db.user.getUsers(ctx.team.id)
    users.forEach(user => pointsOfContact.push(user.id))
  } else {
    pointsOfContact.push(...bot.pointsOfContact)
  }
  return pointsOfContact
}

export async function openMPIM({ ctx, users, intro, message }) {
  const { bot } = ctx

  let mpim
  try {
    mpim = await bot.api.mpim.open(users.join(','))
  } catch (err) {
    if (err.message === 'not_enough_users') {
      await bot.replyWithTyping(message, '_This is where I\'d normally escalate to a group chat, but since you\'re the only point of contact, there\'s nothing to do. If you want to see what would normally happen, have a colleague test it out or add a second point of contact in Luno._')
      return null
    }
    throw err
  }

  if (!mpim.ok) {
    throw new Error('Unable to start MPIM')
  }

  let response
  if (intro) {
    const source = { channel: mpim.group.id }
    response = await bot.replyWithTyping(source, intro)
  }
  return { response, mpim }
}

export function formatPointsOfContact(pointsOfContact, conjunction = 'or') {
  const names = pointsOfContact.map(userId => `<@${userId}>`)
  let formatted
  if (names.length === 1) {
    formatted = names[0]
  } else if (names.length === 2) {
    formatted = names.join(` ${conjunction} `)
  } else {
    formatted = `${names.slice(0, -1).join(', ')} ${conjunction} ${names.slice(-1)}`
  }
  return formatted
}

export async function search({ teamId, query, options }) {
  const searchOptions = { size: 26, ...options }
  const start = Date.now()
  const { responses } = await es.reply.msearch({ teamId, query, options: searchOptions })
  const end = Date.now()
  statsd.histogram('bot.search.time', end - start)
  let hasResults = false
  for (const tier of responses) {
    if (tier.hits && tier.hits.total && tier.hits.total > 0) {
      hasResults = true
    }
  }
  return {
    took: end - start,
    tiers: responses,
    hasResults,
  }
}

// TODO we should cache this
export async function getExampleKeywords(ctx) {
  const teamId = ctx.team.id
  const replies = await db.reply.getReplies(teamId)
  if (!replies.length) return ''

  let minKeywordsReply
  for (const reply of replies) {
    if (!minKeywordsReply) {
      minKeywordsReply = reply
    } else if (reply.title.length < minKeywordsReply.title.length) {
      minKeywordsReply = reply
    }
  }
  return minKeywordsReply.title
}

export async function getFormattedExampleKeywords({ ctx, message }) {
  const { identities: { bot } } = ctx
  const keywords = await getExampleKeywords(ctx)
  if (!keywords) return ''

  let botIdentifier = ''
  if (!message._dm) {
    botIdentifier = `@${bot.name} `
  }

  return `For example \`${botIdentifier}${keywords.toLowerCase()}\`.`
}

function getDeliveryStreamName(botId, teamId) {
  return `bot-${teamId}-${botId}`
}

async function createLogStream(name) {
  const params = {
    logGroupName: config.firehose.cloudwatch.logGroupName,
    logStreamName: name,
  }

  let created = false
  try {
    await new AWS.CloudWatchLogs().createLogStream(params).promise()
    created = true
  } catch (err) {
    if (err.code !== 'ResourceAlreadyExistsException') {
      throw err
    }
  }
  return created
}

export async function ensureDeliveryStream(team) {
  const { id: teamId, userId: botId } = team
  const key = `${teamId}/${botId}`
  debug('Creating log stream', { key, team })

  let created = await createLogStream(key)
  if (created) {
    debug('Created log stream', { team })
  }

  const params = {
    DeliveryStreamName: getDeliveryStreamName(botId, teamId),
    S3DestinationConfiguration: {
      BucketARN: config.firehose.bucket.arn,
      RoleARN: config.firehose.role.arn,
      BufferingHints: {
        IntervalInSeconds: config.firehose.buffer.seconds,
        SizeInMBs: config.firehose.buffer.size,
      },
      CloudWatchLoggingOptions: {
        Enabled: config.firehose.cloudwatch.enabled,
        LogGroupName: config.firehose.cloudwatch.logGroupName,
        LogStreamName: key,
      },
      Prefix: key,
    },
  }

  created = false
  try {
    await new AWS.Firehose().createDeliveryStream(params).promise()
    created = true
  } catch (err) {
    if (err.code !== 'ResourceInUseException') {
      throw err
    }
  }
  return created
}

function cleanMessage(message) {
  const output = {}
  for (const key in Object.keys(message)) {
    if (!key.startsWith('_')) {
      output[key] = message[key]
    }
  }
  return output
}

export async function writeToStream({ botId, teamId, message }) {
  const data = cleanMessage(message)
  const params = {
    DeliveryStreamName: getDeliveryStreamName(botId, teamId),
    Record: {
      Data: `${JSON.stringify(data)}\n`,
    },
  }

  return await new AWS.Firehose().putRecord(params).promise()
}

export async function replyWithExample({ ctx, message, response }) {
  const { bot } = ctx
  const exampleKeywords = await getFormattedExampleKeywords({ ctx, message })
  if (exampleKeywords) {
    response = `${response} ${exampleKeywords}`
  }
  return bot.replyWithTyping(message, response)
}

export function generateLinkForMessage({ ctx, message }) {
  return `https://${ctx.team.name}.slack.com/archives/${message.channel}/p${message.ts.replace('.', '')}`
}

export async function welcomeAdmin({ ctx, userId }) {
  debug('Welcoming admin', { userId })
  const { bot } = ctx
  const dm = await bot.api.dm.open(userId)
  const { channel: { id: channel } } = dm
  return bot.reply({ channel }, 'Welcome to Luno! Let’s start out by seeing how I work. Try asking me some of the following:\n\n- "hi" or "hello"\n- "test"\n- "what\'s the guest wifi password?"\n- "luno tips"')
}

export async function promptToEscalate({ ctx, message, responses }) {
  const event = { type: EVENT_ESCALATION_FLOW, meta: { responses } }
  log({ message, event })
  if (!responses.prompt) {
    throw new Error('Prompt is required')
  }
  return ctx.bot.replyWithTyping(message, responses.prompt)
}

export async function escalate({ ctx, message, responses }) {
  const { bot } = ctx
  const pointsOfContact = await getPointsOfContact(ctx)
  const pointsOfContactAnd = formatPointsOfContact(pointsOfContact, 'and')
  const pointsOfContactOr = formatPointsOfContact(pointsOfContact)
  const _vars = {
    pointsOfContactAnd,
    pointsOfContactOr,
  }
  const shouldEscalate = !pointsOfContact.includes(message.user)
  const admin = {
    dm: '_This is where I would normally escalate to a group chat with the admins, but since you’re one of them, you can’t escalate to yourself._',
    channel: '_This is where I would normally @mention the admins, but since you’re one of them, you can’t escalate to yourself._',
  }
  const adminResponses = Object.assign({}, admin, responses.admin)

  const trackingData = {}
  let hadResponse = true
  if (message._dm) {
    trackingData.dm = true
    debug('DM escalation')
    if (message.subtype === 'bot_message') {
      // Don't support escalating within DMs from bots
      return
    } else if (shouldEscalate) {
      if (responses.dm && responses.mpim) {
        trackingData.mpim = true
        trackingData.points_of_contact = pointsOfContact.length
        await bot.replyWithTyping(message, { text: responses.dm, _vars })
        const users = pointsOfContact.slice()
        users.push(message.user)
        const { response } = await openMPIM({ ctx, users, intro: { text: responses.mpim, _vars }, message })
        debug('openMPIM response', { response })
        const link = generateLinkForMessage({ ctx, message: response })
        await bot.replyWithTyping(message, { text: `The group chat is ready! <${link}|Click here> to jump over to it.`, attachments: [] })
      } else {
        hadResponse = false
      }
    } else {
      trackingData.admin = true
      debug('Not escalating, admin', { pointsOfContact, user: message.user })
      await bot.replyWithTyping(message, { text: adminResponses.dm, _vars })
    }
  } else {
    trackingData.dm = false
    debug('Channel escalation')
    if (shouldEscalate) {
      if (responses.channel) {
        await bot.replyWithTyping(message, { text: responses.channel, _vars })
      } else {
        hadResponse = false
      }
    } else {
      trackingData.admin = true
      debug('Not escalating, admin', { pointsOfContact, user: message.user })
      await bot.replyWithTyping(message, { text: adminResponses.channel, _vars })
    }
  }

  if (!hadResponse) {
    logger.error('No escalation response defined', { event, message, shouldEscalate })
  }
  const event = { type: EVENT_ESCALATED, meta: trackingData }
  log({ message, event })
  tracker.trackEscalation({ ctx, message, ...trackingData })
}
