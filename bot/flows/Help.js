import { EVENT_HELP_FLOW } from 'luno-core/lib/db/thread'
import {
  getFormattedExampleKeywords,
  getBotPurpose,
  getSummonVerb,
  getFormalName,
  getSummonName,
} from '../actions'
import logger from '../logger'
import { matches } from '../middleware/stripped'
import { log, receive } from '../middleware/thread'
import utterances from '../utterances'
import tracker from '../tracker'
import Flow, { run } from './Flow'

const debug = require('debug')('bot:flows:Help')

function getHelp({ ctx, purpose, message, example }) {
  const name = getFormalName(ctx)
  const summon = getSummonVerb(message)
  const summonName = getSummonName({ ctx, message })

  let response
  if (purpose) {
    response = `I'm ${name}, an automated FAQ bot for the team. I can answer basic questions related to ${purpose}. Just ${summon} me with some keywords, and I can look up the answer. ${example}If you need a real person, just type \`${summonName}human\` and I'll ping someone who can help.`
  } else {
    response = `I'm ${name}, an automated FAQ bot for the team. Just ${summon} me with some keywords, and I can look up the answer. ${example}If you need a real person, just type \`${summonName}human\` and I'll ping someone who can help.`
  }
  return response
}

export async function help({ ctx, message }) {
  tracker.trackHelp({ ctx, message })
  receive({ ctx, message })
  log({ message, event: { type: EVENT_HELP_FLOW } })

  const purpose = await getBotPurpose(ctx)
  let exampleKeywords
  try {
    exampleKeywords = await getFormattedExampleKeywords({ ctx, message })
  } catch (err) {
    logger.error('Error fetching example keywords', { ctx, message, err })
  }

  let example = ''
  if (exampleKeywords) {
    example = `${exampleKeywords} `
  }

  const response = getHelp({ ctx, purpose, message, example })
  return ctx.bot.replyWithTyping(message, response)
}

class Help extends Flow {

  events = ['direct_message:message', 'direct_mention:message']
  patterns = utterances.help

  match = async ({ message }) => {
    if (message.event && this.events.includes(message.event) && matches(this.patterns, message)) {
      debug('Message match', { message })
      return true
    }
    return false
  }

  run = async ({ message, ctx }) => run({ fn: help, message, ctx })

}

export default Help
