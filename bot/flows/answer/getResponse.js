function resultsAttachment({ hits, escalation = '' }) {
  const lines = []
  let currentCharCode = 97
  for (const hit of hits.slice(0, 26)) {
    const formatted = `_type_ \`${String.fromCharCode(currentCharCode)}\` _for_ *${hit._source.displayTitle}*`
    lines.push(formatted)
    currentCharCode += 1
  }
  if (escalation) {
    lines.push(escalation)
  }
  const content = lines.join('\n')
  return {
    fallback: content,
    text: content,
    mrkdwn_in: ['text'],
  }
}

export function formatSingleResult({ _source: source }) {
  return `*${source.displayTitle}*\n${source.body}`
}

function singleResult({ results }) {
  const { hits: { hits } } = results
  return {
    text: formatSingleResult(hits[0]),
    attachments: [],
    meta: { hits, total: 1 },
  }
}

function multipleTier1Tier2Results({ results, summon }) {
  const { hits: { hits, total } } = results
  let text = `I found ${total} results. Which one do you want to see?`
  let escalation
  if (total > 5) {
    escalation = `\n_If you don’t see what you’re looking for, try a different query to narrow down the results, or type \`${summon}human\` if you want me to ping someone who can help._`
  }

  if (total >= 26) {
    const cap = Math.min(total, 26)
    text = `Here are the first ${cap} results. Which one do you want to see?`
  }
  return {
    text,
    attachments: [resultsAttachment({ hits, escalation })],
    meta: { hits, total: hits.length },
  }
}

function tier3Results({ results, summon }) {
  const { hits: { hits, total } } = results
  if (total === 1) {
    const result = formatSingleResult(hits[0])
    return {
      text: `I couldn't find exactly what you were looking for, but here's the closest match:\n${result}`,
      attachments: [],
      meta: { hits, total: 1 },
    }
  }

  const cap = Math.min(total, 26)
  const text = `I couldn't find exactly what you were looking for, but here's the ${cap} closest matches. Which one do you want to see?`
  const escalation = `\n_If you don't see what you're looking for, try a different query to see if I can do better, or type \`${summon}human\` if you want me to ping someone who can help._`
  return {
    text,
    attachments: [resultsAttachment({ hits, escalation })],
    meta: { hits, total: hits.length },
  }
}

export default function getResponse({ results, summon = '' }) {
  const [tier1, tier2, tier3] = results
  const tier1Total = tier1.hits.total
  const tier2Total = tier2.hits.total
  const tier3Total = tier3.hits.total
  let response = {}
  if (tier2Total > 5) {
    if (tier1Total === 1) {
      response = singleResult({ results: tier1 })
    } else if (tier1Total > 0) {
      response = multipleTier1Tier2Results({ results: tier1, summon })
    } else {
      response = multipleTier1Tier2Results({ results: tier2, summon })
    }
  } else if (tier2Total >= 1) {
    if (tier2Total === 1) {
      response = singleResult({ results: tier2 })
    } else {
      response = multipleTier1Tier2Results({ results: tier2, summon })
    }
  } else if (tier3Total > 0) {
    response = tier3Results({ results: tier3, summon })
  }
  return {
    link_names: true,
    ...response,
  }
}
