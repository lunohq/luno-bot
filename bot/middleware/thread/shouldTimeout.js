/**
 * Determine whether or not the thread should be timed out.
 *
 * This is how we implement dialogue within channels.
 *
 * @param {Object} options an existing thread
 * @return Boolean boolean for whether or not the thread should be timed out.
 */
export default function shouldTimeout({ message, thread }) {
  if (message.event === 'ambient:message') {
    return thread.isTimedOut()
  }
  return false
}
