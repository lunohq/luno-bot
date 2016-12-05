import Flow from './Flow'
import {
  getBotPurpose,
  replyWithExample,
  getSummonVerb,
  getFormalName,
} from '../actions'

const debug = require('debug')('bot:flows:Welcome')

function getWelcome({ ctx, message, purpose }) {
  const name = getFormalName(ctx)
  const summon = getSummonVerb(message)

  let response
  if (purpose) {
    response = `Hi there! I'm ${name}, an automated FAQ bot for the team. I can answer basic questions related to ${purpose}. Just ${summon} me with some keywords, and I can look up the answer.`
  } else {
    response = `Hi there! I\'m ${name}, an automated FAQ bot for the team. Just ${summon} me with some keywords, and I can look up the answer.`
  }
  return response
}

export async function welcome({ ctx, message }) {
  return new Promise(async (resolve, reject) => {
    debug('Running Welcome flow')
    let purpose
    try {
      purpose = await getBotPurpose(ctx)
    } catch (err) {
      return reject(err)
    }

    const response = getWelcome({ ctx, message, purpose })
    setTimeout(async () => {
      ctx.bot.startTyping(message)
      await replyWithExample({ ctx, message, response })
      resolve()
    }, 500)
    return null
  })
}

class Welcome extends Flow {
  events = ['bot_channel_join', 'bot_group_join']
  match = async ({ ctx, message }) => {
    const { bot } = ctx
    let channelId = message.channel
    if (typeof channelId === 'object') {
      channelId = message.channel.id
    }
    const channel = await bot.rtm.dataStore.getChannelById(channelId)
    if (channel && channel.name && channel.name.startsWith('luno-file-uploads')) {
      return false
    }
    return this.events.includes(message.event)
  }
  run = async ({ message, ctx }) => welcome({ message, ctx })
}

export default Welcome
