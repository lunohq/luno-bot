import test from 'ava'
import faker from 'faker'

import { generateResultsFromHit } from '../inferAnswer'

test('generating `handleResults` compatible results from a single hit', t => {
  const hit = { _source: { displayTitle: faker.lorem.sentence(), body: faker.lorem.sentence() } }
  const results = generateResultsFromHit(hit)
  const { tiers, took } = results
  t.is(took, 0)
  t.is(tiers.length, 3, 'Should generate three tiers of results')
  const tier1 = tiers[0]
  const tier2 = tiers[1]
  const tier3 = tiers[2]
  t.deepEqual(tier1, tier2)
  t.deepEqual(tier2, tier3)
  t.is(tier1.hits.total, 1)
  t.is(tier2.hits.total, 1)
  t.is(tier3.hits.total, 1)
  t.deepEqual(tier1.hits.hits[0], hit)
  t.deepEqual(tier2.hits.hits[0], hit)
  t.deepEqual(tier3.hits.hits[0], hit)
})
