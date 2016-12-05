const debug = require('debug')('bot:middleware:expire')

export function expireMessage(message) {
  debug('Expiring message', { message })
  message._expired = true
}

function isExpired(source) {
  let expired = false
  if (source._expired) {
    expired = true
  } else if (source._thread && !source._thread.open) {
    expired = true
  } else if (source._thread && source._thread.isTimedOut()) {
    expired = true
  }
  return expired
}

export default function expire({ ctx, source, message, next }) {
  if (isExpired(source)) {
    debug('Dropping expired message', { message })
    ctx.send = false
  } else {
    return next()
  }
  return null
}
