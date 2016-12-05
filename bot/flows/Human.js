import Flow, { run } from './Flow'
import { EVENT_HUMAN_FLOW } from 'luno-core/lib/db/thread'
import { escalate } from '../actions'
import { matches } from '../middleware/stripped'
import { commit, log, receive } from '../middleware/thread'
import utterances from '../utterances'
import tracker from '../tracker'

const debug = require('debug')('bot:flows:Human')

export async function human({ ctx, message }) {
  tracker.trackHuman({ ctx, message })
  receive({ ctx, message })
  log({ message, event: { type: EVENT_HUMAN_FLOW } })
  let user
  // username can be populated if the message is sent via a bot
  if (message.username) {
    user = `@${message.username}`
  } else {
    user = `<@${message.user}>`
  }

  const ack = 'Sure thing.'
  const responses = {
    dm: `${ack} I'll setup a group chat with {{{pointsOfContactAnd}}}.`,
    channel: `${ack} {{{pointsOfContactOr}}} - ${user} needs your help.`,
    mpim: `${user} - {{{pointsOfContactOr}}} should be able to help you out. Can you repeat your question here?`,
  }
  await escalate({ ctx, message, responses })
  await commit({ message, close: true })
  debug('Ran Human flow')
}

class Human extends Flow {
  events = ['direct_message:message', 'direct_mention:message']
  patterns = utterances.human

  match = async ({ message }) => {
    if (this.events.includes(message.event) && matches(this.patterns, message)) {
      debug('Message match', { message })
      return true
    }
    return false
  }

  run = async ({ message, ctx }) => run({ fn: human, message, ctx })
}

export default Human
