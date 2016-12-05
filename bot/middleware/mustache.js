import { default as m } from 'mustache'

import logger from '../logger'

const debug = require('debug')('bot:middleware:mustache')

export default function mustache({ message, next }) {
  if (message.text && message._vars) {
    debug('Running mustache middleware', { message })
    try {
      message.text = m.render(message.text, { ...message._vars })
    } catch (err) {
      logger.error('Error rendering mustache template', { err, message })
    }
    debug('Ran mustache middleware', { message })
  }
  return next()
}
