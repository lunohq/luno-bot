import logger from '../logger'
import { expireMessage } from '../middleware/expire'
import { getSummonName } from '../actions'
import { closeOnCommit, start } from '../middleware/thread'

const debug = require('debug')('bot:flows:Flow')

const TYPING_INTERVAL = 2500
const FLOW_TIMEOUT = 15000

async function fallback({ ctx, message }) {
  const summonName = getSummonName({ ctx, message })
  const response = `Sorry, I'm having some issues. Type \`${summonName}human\` if you need help from a real person.`
  return ctx.bot.replyWithTyping(message, response)
}

export async function run({ fn, ctx, message, informOnError, informOnTimeout, typing, newThreadOnStart, unlockOnComplete, closeOnComplete }) {
  const { bot } = ctx
  const onError = informOnError === undefined ? true : informOnError
  const onTimeout = informOnTimeout === undefined ? true : informOnTimeout
  const unlock = unlockOnComplete === undefined ? true : unlockOnComplete
  const startThread = newThreadOnStart === undefined ? true : newThreadOnStart
  const closeThread = closeOnComplete === undefined ? true : closeOnComplete

  let typingIntervalId
  if (typing !== false) {
    bot.startTyping(message)
    typingIntervalId = setInterval(() => {
      bot.startTyping(message)
    }, TYPING_INTERVAL)
  }

  const flowTimeoutId = setTimeout(async () => {
    logger.error('Flow timeout', { ctx, message, flow: fn.name })
    if (onTimeout) {
      await fallback({ ctx, message })
    }
    expireMessage(message)
    cleanup()
  }, FLOW_TIMEOUT)

  function cleanup() {
    clearInterval(typingIntervalId)
    clearTimeout(flowTimeoutId)
    if (
      unlock &&
      message._thread &&
      message._thread.mutex &&
      typeof message._thread.mutex.unlock === 'function'
    ) {
      debug('Unlocked thread', { message })
      message._thread.mutex.unlock()
    }
    if (closeThread) {
      closeOnCommit({ message })
    }
  }

  let response
  try {
    if (startThread) {
      await start({ ctx, message })
    }
    response = await fn({ ctx, message })
  } catch (err) {
    debug('Flow error', { err })
    if (onError) {
      await fallback({ ctx, message })
      expireMessage(message)
    }
    cleanup()
    throw err
  }

  debug('Flow ended', { response })
  cleanup()
  return response
}

class Flow {

  match = async () => false
  run = async () => {}

}

export default Flow
