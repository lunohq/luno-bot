/**
 * Flows for the bot.
 *
 * When adding or removing a flow, keep this doc in sync: https://goo.gl/8pjojl
 */
import logger from '../logger'

import Greet from './Greet'
import Help from './Help'
import Welcome from './Welcome'
import WelcomeAdmin from './WelcomeAdmin'
import Human from './Human'
import Infer from './Infer'
import Feedback from './Feedback'

const debug = require('debug')('bot:flows:middleware')

const registered = [
  new Greet(),
  new Help(),
  new Welcome(),
  new WelcomeAdmin(),
  new Human(),
  new Infer(),
  new Feedback(),
]

export default async function flows({ ctx, message, next }) {
  for (const flow of registered) {
    debug('Checking flow: %s', flow.constructor.name)
    const match = await flow.match({ ctx, message })
    if (match) {
      debug('Running flow: %s', flow.constructor.name)
      try {
        await flow.run({ ctx, message })
      } catch (err) {
        logger.error('Error running flow', { flow: flow.constructor.name, err, ctx, message })
      }
      debug('Ran flow: %s', flow.constructor.name)
      break
    }
  }
  return next()
}
