import { EVENT_GREETING_FLOW } from 'luno-core/lib/db/thread'
import { getBotPurpose, replyWithExample, getSummonVerb } from '../actions'
import { matches } from '../middleware/stripped'
import { log, receive, commit } from '../middleware/thread'
import { greetings } from '../utterances'
import tracker from '../tracker'
import Flow, { run } from './Flow'

const debug = require('debug')('bot:flows:Greet')

function getGreeting({ purpose, message }) {
  const summon = getSummonVerb(message)

  let response
  if (purpose) {
    response = `Hi there! How can I help? Just ${summon} me with some keywords related to ${purpose}, and I can look up the answer.`
  } else {
    response = `Hi there! How can I help? Just ${summon} me with some keywords, and I can look up the answer.`
  }
  return response
}

async function greet({ message, ctx }) {
  tracker.trackGreeting({ ctx, message })
  receive({ ctx, message })
  log({ message, event: { type: EVENT_GREETING_FLOW } })

  const purpose = await getBotPurpose(ctx)
  const response = getGreeting({ ctx, purpose, message })
  await replyWithExample({ ctx, message, response })
  if (message.event === 'mention:message') {
    await commit({ message, close: true })
  }
}

class Greet extends Flow {

  events = ['direct_message:message', 'direct_mention:message']
  patterns = greetings

  match = async ({ message }) => {
    if (message.event && this.events.includes(message.event) && matches(this.patterns, message)) {
      debug('Message match', { message })
      return true
    }

    if (message.event === 'mention:message') {
      debug('Mention match', { message })
      return true
    }
    return false
  }

  run = async ({ message, ctx }) => run({ fn: greet, message, ctx })

}

export default Greet
