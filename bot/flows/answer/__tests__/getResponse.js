import test from 'ava'

import getResponse from '../getResponse'
import { mockTieredResults } from './_factories'

test('tier1, high confidence', t => {
  const results = mockTieredResults([1, 6, 6])
  const { hits: { hits } } = results[0]
  const hit = hits[0]
  const response = getResponse({ results })
  t.is(response.meta.total, 1)
  t.deepEqual(response.attachments, [], 'Attachments should be present to push through web api')
  t.is(response.text, `*${hit._source.displayTitle}*\n${hit._source.body}`)
  t.true(response.link_names, 'Link names should be true')
})

test('tier1, high confidence, multiple results', t => {
  const results = mockTieredResults([5, 10, 10])
  const response = getResponse({ results })
  t.is(response.meta.total, 5)
  t.is(response.attachments.length, 1, 'Should have a single attachment with results')
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 5, 'Attachment should have a new line for each answer')
})

test('tier1, medium confidence', t => {
  const results = mockTieredResults([10, 20, 20])
  const response = getResponse({ results })
  t.is(response.meta.total, 10)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 11, 'Attachment should have a new line for each answer and an escalation line')
})

test('tier1, low confidence', t => {
  const results = mockTieredResults([30, 30, 30])
  const response = getResponse({ results })
  t.is(response.attachments.length, 1)
  t.is(response.meta.total, 30)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 27, 'Attachment should have a new line for each answer and an escalation line')
  t.true(response.text.includes('first'))
  t.true(response.text.includes('26'))
})

test('tier2, high confidence', t => {
  const results = mockTieredResults([1, 1, 2])
  const tier2 = results[1]
  const { hits: { hits } } = tier2
  const hit = hits[0]
  const response = getResponse({ results })
  t.is(response.meta.total, 1)
  t.deepEqual(response.attachments, [], 'Attachments should be present to push through web api')
  t.is(response.text, `*${hit._source.displayTitle}*\n${hit._source.body}`)
  t.true(response.link_names, 'Link names should be true')
})

test('tier2, high confidence, multiple results', t => {
  const results = mockTieredResults([2, 5, 3])
  const response = getResponse({ results })
  t.is(response.meta.total, 5)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 5, 'Attachment should have a new line for each reply')
})

test('tier2, medium confidence', t => {
  const results = mockTieredResults([0, 20, 30])
  const response = getResponse({ results })
  t.is(response.meta.total, 20)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 21, 'Attachment should have a new line for each answer and an escalation line')
  t.false(response.text.includes('first'))
})

test('tier2, low confidence', t => {
  const results = mockTieredResults([0, 30, 30])
  const response = getResponse({ results })
  t.is(response.meta.total, 30)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 27, 'Attachment should have a new line for each answer and an escalation line')
  t.true(response.text.includes('first'))
  t.true(response.text.includes('26'))
})

test('tier3, low confidence, multiple results', t => {
  const results = mockTieredResults([0, 0, 5])
  const response = getResponse({ results })
  t.is(response.meta.total, 5)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 6, 'Attachment should have a new line for each answer and an escalation line')
  t.true(response.text.includes('exactly'))
})

test('tier3, low confidence, 26+ results', t => {
  const results = mockTieredResults([0, 0, 30])
  const response = getResponse({ results })
  t.is(response.meta.total, 30)
  t.is(response.attachments.length, 1)
  const { text } = response.attachments[0]
  t.is(text.split('\n').length, 27, 'Attachment should have a new line for each answer and an escalation line')
  t.true(response.text.includes('exactly'))
  t.true(response.text.includes('26'))
})

test('tier3, low confidence', t => {
  const results = mockTieredResults([0, 0, 1])
  const tier3 = results[2]
  const { hits: { hits } } = tier3
  const hit = hits[0]
  const response = getResponse({ results })
  t.is(response.meta.total, 1)
  t.deepEqual(response.attachments, [], 'Attachments should be present to push through web api')
  const parts = response.text.split('\n')
  const [first, second, third] = parts
  t.true(first.includes('exactly'))
  t.true(second.includes(hit._source.displayTitle))
  t.true(third.includes(hit._source.body))
})
