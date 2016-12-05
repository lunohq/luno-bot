/**
 * Tracking of events within mixpanel.
 *
 * When adding, updating, or removing events, keep this doc in sync: https://goo.gl/xtUpdl
 *
 */
import Mixpanel from 'mixpanel'

import logger from './logger'
import config from './config/environment/index'
import statsd from './statsd'

const debug = require('debug')('bot:tracker')

const ACTION = 'Bot Action'
const MESSAGE = 'Bot Message'

const people = {}

/*eslint-disable camelcase */
class Tracker {

  constructor(token, verbose) {
    this.mixpanel = Mixpanel.init(token, { verbose })
  }

  track(event, data) {
    return new Promise((resolve, reject) => {
      this.mixpanel.track(event, data, (err) => {
        if (err) {
          logger.error('Error tracking event', { err, event, data })
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  trackWithCtx({ ctx, message, event, data }) {
    const { team } = ctx
    const { bot: { identity: { id: botUserId } } } = ctx
    if (!team) {
      logger.error('Tracking error: No team found on ctx', { ctx, message, event, data })
      return
    }

    const { bot } = team
    if (!bot) {
      logger.error('Tracking error: No bot found on team', { team, message, event, data })
      return
    }

    if (message.user === botUserId) {
      debug('Skipping tracking of luno message', { message, event, data })
      return
    } else if (message.user === 'USLACKBOT') {
      debug('Skipping tracking of slackbot message', { message, event, data })
      return
    }

    const payload = {
      'Team ID': team.id,
      'Bot ID': bot.id,
      'User ID': message.user,
      Channel: message.channel,
      DM: !!message._dm,
      Client: 'bot',
      ...data,
    }
    if (message.user) {
      payload.distinct_id = `${ctx.team.id}:${message.user}`
      this.trackUser({ ctx, message })
    }
    debug(`Tracking ${event}`, payload)
    this.track(event, payload)
  }

  trackUser = async ({ ctx, message }) => {
    // only track users who have sent messages
    const { team } = ctx
    if (!team) {
      logger.error('Tracking error: No team found on ctx', { ctx, message })
      return
    }

    const { bot } = team
    if (!bot) {
      logger.error('Tracking error: No bot found on team', { team, message })
      return
    }

    const user = await ctx.bot.rtm.dataStore.getUserById(message.user)
    if (user) {
      debug('Tracking user', { user })
      const distinctId = `${team.id}:${user.id}`
      if (people[distinctId]) {
        debug('User already tracked')
        return
      }

      const props = {
        $first_name: user.name,
        'User ID': user.id,
        'Team ID': team.id,
        'Team Name': team.name,
        Username: user.name,
      }

      if (user.profile && user.profile.email) {
        props.$email = user.profile.email
      }

      this.mixpanel.people.set(distinctId, props)
      this.mixpanel.people.set_once(distinctId, {
        'First Seen': new Date(),
      })
      people[distinctId] = true
    } else if (message.bot_id && message.user.toLowerCase() !== 'uslackbot') {
      debug('Tracking Bot User', { user: message.user })
      const distinctId = `${team.id}:${message.user}`
      if (people[distinctId]) {
        debug('Bot already tracked')
        return
      }

      const props = {
        'User ID': message.user,
        'Team ID': team.id,
        'Team Name': team.name,
      }
      if (message.username) {
        props.$first_name = message.username
        props.Username = message.username
      }

      this.mixpanel.people.set(distinctId, props)
      this.mixpanel.people.set_once(distinctId, {
        'First Seen': new Date(),
      })
      people[distinctId] = true
    }
  }

  trackMessageReceived({ ctx, message }) {
    statsd.increment('bot.msg.received')
    const { team } = ctx
    if (!team) {
      logger.error('Tracking error: No team found on ctx', { ctx, message })
      return
    }

    if (message.user && message.user.toLowerCase() !== 'uslackbot') {
      const distinctId = `${team.id}:${message.user}`
      const now = new Date()
      this.mixpanel.people.set(distinctId, { 'Last Bot Message': now })
      this.mixpanel.people.set_once(distinctId, { 'First Bot Message': now })
    }
  }

  trackAskForClarification({ ctx, message, length }) {
    const data = { Type: 'Ask for Clarification', 'Number of Words': length }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackSmartAnswer({ ctx, message }) {
    const data = { Type: 'Smart Reply', 'Message Text': message.text }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackGreeting({ ctx, message }) {
    const data = { Type: 'Greeting' }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackHelp({ ctx, message }) {
    const data = { Type: 'Help' }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackHuman({ ctx, message }) {
    const data = { Type: 'Human' }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackNoResults({ ctx, message, query }) {
    const data = { Type: 'No Results', query }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackMultipleResults({ ctx, message, ...other }) {
    const data = { Type: 'Multiple Results', ...other }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackInferredResultChoice({ ctx, message, index, text, totalResults }) {
    const data = {
      Type: 'Inferred Result Choice',
      'Choice Index': index,
      'Message Text': text,
      'Total Results': totalResults,
    }
    this.trackWithCtx({ ctx, message, data, event: ACTION })
  }

  trackEscalation({ ctx, message, dm, mpim, points_of_contact, admin }) {
    const data = {
      Type: 'Escalation',
      'Is DM': dm,
      'Did MPIM': mpim,
      'Total Points of Contact': points_of_contact,
      'Is Admin': admin,
    }
    this.trackWithCtx({ ctx, message, data, event: MESSAGE })
  }

  trackFeedback({ ctx, message, positive, responding }) {
    const data = {
      'Did Respond': responding,
    }
    if (positive) {
      data.Type = 'Positive Feedback'
    } else {
      data.Type = 'Negative Feedback'
    }
    this.trackWithCtx({ ctx, message, data, event: ACTION })
  }

  trackInferredEscalation({ ctx, message, escalated }) {
    const data = { Type: 'Inferred Escalation', Escalated: escalated }
    this.trackWithCtx({ ctx, message, data, event: ACTION })
  }

}
/*eslint-enable camelcase*/

export default new Tracker(config.mixpanel.token, config.mixpanel.verbose)
