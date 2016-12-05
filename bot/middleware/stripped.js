export function matches(patterns, message) {
  if (message.subtype && message.subtype !== 'bot_message') {
    return false
  }

  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      return !!message._stripped.match(pattern)
    }

    if (pattern === message._stripped) {
      return true
    }
  }
  return false
}

export default async function stripped({ ctx, message, next }) {
  const { identities: { bot: { id: botId } } } = ctx
  const { text } = message
  if (text !== undefined && text !== null) {
    const stripped = text.replace(new RegExp(`\<@${botId}\>`, 'g'), '').replace(/[.,\/#!$\?%\^&\*:{}=\-_`~()\s]/g, '').toLowerCase()
    message._stripped = stripped
  }
  return next()
}
