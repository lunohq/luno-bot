import faker from 'faker'

export function mockResults(num, existing) {
  let hits = []
  if (existing) {
    const { hits: { hits: existingHits } } = existing
    hits = [].concat(existingHits)
  }

  let create = num
  if (hits.length) {
    create -= hits.length
  }
  for (let i = 0; i < create; i++) {
    hits.push(mockHit(i))
  }
  return { hits: { hits, total: num } }
}

function mockHit(index) {
  return {
    _source: {
      displayTitle: `Mock Result ${index}: ${faker.lorem.word()}`,
      body: `Mock Body ${index}: ${faker.lorem.sentence()}`,
    },
  }
}

export function mockTieredResults(tiers) {
  const [numTier1, numTier2, numTier3] = tiers
  const tier1 = mockResults(numTier1)
  const tier2 = mockResults(numTier2, tier1)
  const tier3 = mockResults(numTier3, tier2)
  return [tier1, tier2, tier3]
}
