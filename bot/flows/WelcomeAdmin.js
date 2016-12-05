import Flow from './Flow'
import { db } from 'luno-core'

import { welcomeAdmin } from '../actions'

class WelcomeAdmin extends Flow {
  events = ['new_user']
  match = async({ message }) => this.events.includes(message.event)
  run = async ({ message, ctx }) => {
    const { userId } = message
    if (!userId) {
      throw new Error('userId required')
    }
    const user = await db.user.getUser(userId)
    if (!user.invite) {
      return welcomeAdmin({ ctx, userId })
    }
    return null
  }
}

export default WelcomeAdmin
