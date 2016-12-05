import { matches } from '../../middleware/stripped'
import { escalate } from '../../actions'
import { commit, receive } from '../../middleware/thread'
import utterances from '../../utterances'
import tracker from '../../tracker'

const debug = require('debug')('bot:flows:Infer:inferEscalation')

export default async function inferEscalation({ ctx, message, event }) {
  debug('Infering from escalation flow', { message, event })
  const { bot } = ctx
  let inferred = false
  const trackingData = {}
  if (matches(utterances.yes, message)) {
    trackingData.escalated = true
    bot.startTyping(message)
    debug('Inferred escalation')
    inferred = true
    const { meta: { responses } } = event
    receive({ ctx, message })
    await escalate({ ctx, message, responses })
  } else if (matches(utterances.no, message)) {
    trackingData.escalated = false
    debug('Inferred no escalation')
    inferred = true
    receive({ ctx, message })
    await bot.replyWithTyping(message, 'Ok, I\'ll hold off.')
  }

  if (inferred) {
    tracker.trackInferredEscalation({ ctx, message, ...trackingData })
  }

  if (message.event === 'ambient:message' && !inferred) {
    debug('Failed to infer, closing thread')
    inferred = true
  }

  if (inferred) {
    await commit({ message, close: true })
  }
  return inferred
}
