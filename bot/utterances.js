export const greetings = [
  'hi',
  'hello',
  'hey',
  'yo',
  '',
]

export const help = [
  'help',
]

export const human = [
  'human',
]

export const yes = [
  new RegExp(/^(yes|yea|yup|yep|ya|sure|ok|yeah|yah)/i),
]

export const no = [
  new RegExp(/^(no|nah|nope)/i),
]

export default {
  greetings,
  help,
  human,
  yes,
  no,
}
