import {
  EVENT_ANSWER_FLOW,
  EVENT_ESCALATION_FLOW,
} from 'luno-core/lib/db/thread'

import { isOpen, commit } from '../../middleware/thread'
import logger from '../../logger'

import Flow, { run } from '../Flow'
import answer from '../answer'

import inferAnswer from './inferAnswer'
import inferEscalation from './inferEscalation'

const debug = require('debug')('bot:flows:Infer')

export async function infer({ ctx, message }) {
  const event = message._thread.getLastFlow()
  debug('Infering from last flow', { event })
  let inferred
  if (event) {
    switch (event.type) {
      case EVENT_ANSWER_FLOW:
        inferred = await inferAnswer({ ctx, message })
        break
      case EVENT_ESCALATION_FLOW:
        inferred = await inferEscalation({ ctx, message, event })
        break
      default:
    }
  }

  debug('Infer result', { inferred })
  return inferred
}

function shouldCloseThread(message) {
  let shouldClose = false
  let lastEvent
  if (message._thread) {
    lastEvent = message._thread.getLastFlow()
  }

  if (lastEvent) {
    // we don't enable consecutive inferred searches. it causes issues if
    // someone is trying to point someone to something in luno, they search and
    // then describe something about the result, we don't want to infer that as
    // a search.
    if (
      message.event === 'ambient:message' &&
      lastEvent.type === EVENT_ANSWER_FLOW
    ) {
      debug('Closing thread: consecutive search')
      shouldClose = true
    }
  }
  return shouldClose
}

class Infer extends Flow {
  events = ['direct_message:message', 'direct_mention:message']

  match = async ({ message }) => {
    if (message.username === 'slackbot' || message.user === 'USLACKBOT') {
      return false
    }

    if (this.events.includes(message.event)) {
      return true
    }

    if (message.event === 'ambient:message' && isOpen(message)) {
      debug('Abmient message match', { message })
      return true
    }
    return false
  }

  run = async ({ ctx, message }) => {
    let inferred
    if (message._thread) {
      try {
        inferred = await run({
          ctx,
          message,
          fn: infer,
          informOnError: false,
          informOnTimeout: false,
          typing: false,
          unlockOnComplete: false,
          newThreadOnStart: false,
          closeOnComplete: false,
        })
      } catch (err) {
        logger.error('Error inferring response', { ctx, message, err })
        inferred = false
      }
    }

    if (!inferred) {
      if (shouldCloseThread(message)) {
        debug('Closing thread')
        await commit({ message, close: true })
      } else {
        debug('No inference, falling back to answer', { message })
        await run({ fn: answer, closeOnComplete: false, ctx, message })
      }
    }
    debug('Exiting infer flow')
  }

}

export default Infer
