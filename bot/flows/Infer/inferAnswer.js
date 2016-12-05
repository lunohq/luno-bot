import { EVENT_MULTIPLE_RESULTS } from 'luno-core/lib/db/thread'
import { handleResults } from '../answer'
import tracker from '../../tracker'
import { receive } from '../../middleware/thread'

const debug = require('debug')('bot:flows:Infer:inferAnswer')

function getChoice({ meta: { hits } }, text) {
  text = text.trim().toLowerCase()
  let index = parseInt(text, 10)
  if (isNaN(index) && text.length === 1) {
    index = text.charCodeAt(0) - 97
    if (!(index >= 0 && index <= 25)) {
      index = null
    }
  } else if (!isNaN(index)) {
    index--
  } else {
    index = null
  }

  if (index >= hits.length) {
    index = null
  }
  return index
}

export function generateResultsFromHit(hit) {
  const tiers = []
  for (let i = 0; i < 3; i++) {
    tiers.push({
      hits: { hits: [hit], total: 1 },
    })
  }
  return {
    tiers,
    took: 0,
  }
}

export default async function inferAnswer({ ctx, message }) {
  let inferred = false
  const event = message._thread.getLastEventOfType(EVENT_MULTIPLE_RESULTS)
  if (event) {
    const choice = getChoice(event, message.text)
    debug('Choice', { choice, hits: event.meta.hits.length })
    if (choice !== null) {
      tracker.trackInferredResultChoice({
        ctx,
        message,
        index: choice,
        text: message.text,
        totalResults: event.meta.hits.length,
      })
      debug('Inferring answer', { choice, event })
      receive({ ctx, message })
      await handleResults({ ctx, message, results: generateResultsFromHit(event.meta.hits[choice]) })
      inferred = true
    }
  }
  return inferred
}
