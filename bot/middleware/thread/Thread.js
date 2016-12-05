import {
  FLOW_EVENTS,
  THREAD_STATUS_OPEN,
  EVENT_MESSAGE_RECEIVED,
  EVENT_MESSAGE_SENT,
} from 'luno-core/lib/db/thread'

const MAX_MESSAGE_AGE = 60

function getMessageAge(message) {
  const ts = message.ts.split('.')[0]
  return Date.now() / 1000 - parseInt(ts, 10)
}

class Thread {

  constructor({ model, events, mutex }) {
    this.model = model
    this.events = events
    this.mutex = mutex
  }

  inspect() {
    return {
      model: this.model,
      events: this.events,
      length: this.events && this.events.length,
    }
  }

  getLastEventOfType(type) {
    return this.reverseFilterEvents(event => event.type === type)
  }

  reverseFilterEvents(cb) {
    if (!this.events) {
      return null
    }
    for (let i = this.events.length - 1; i > -1; i--) {
      const event = this.events[i]
      if (cb(event)) {
        return event
      }
    }
    return null
  }

  getLastReceivedMessage() {
    const event = this.reverseFilterEvents(event => event.type === EVENT_MESSAGE_RECEIVED && event.message && event.message.ts)
    return event ? event.message : null
  }

  getLastSentMessage() {
    const event = this.getLastEventOfType(EVENT_MESSAGE_SENT)
    return event ? event.message : null
  }

  getLastEvent() {
    if (!this.events) {
      return null
    }
    return this.events[this.events.length - 1]
  }

  getLastFlow() {
    return this.reverseFilterEvents(event => FLOW_EVENTS.includes(event.type))
  }

  get open() {
    return this.model && this.model.status === THREAD_STATUS_OPEN
  }

  get closed() {
    return this.model && this.model.status !== THREAD_STATUS_OPEN
  }

  isTimedOut() {
    let timedout = false
    const lastMessage = this.getLastReceivedMessage()
    if (lastMessage) {
      const age = getMessageAge(lastMessage)
      if (age > MAX_MESSAGE_AGE) {
        timedout = true
      }
    }
    return timedout
  }

}

export default Thread
