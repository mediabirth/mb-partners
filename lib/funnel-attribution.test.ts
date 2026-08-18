import assert from 'node:assert/strict'
import test from 'node:test'
import { makeFunnelDedupHash, normalizeFunnelAttribution } from './funnel-attribution'

const MENU_ID = '123e4567-e89b-42d3-a456-426614174000'

test('funnel attribution accepts digest/card with UUID menu', () => {
  assert.deepEqual(normalizeFunnelAttribution('digest', MENU_ID), { src: 'digest', menuId: MENU_ID })
  assert.deepEqual(normalizeFunnelAttribution('card', MENU_ID), { src: 'card', menuId: MENU_ID })
})

test('funnel attribution rejects unknown source and malformed menu', () => {
  assert.deepEqual(normalizeFunnelAttribution('email', 'not-a-uuid'), { src: null, menuId: null })
})

test('legacy event shape remains nullable', () => {
  assert.deepEqual(normalizeFunnelAttribution(undefined, undefined), { src: null, menuId: null })
  assert.equal(makeFunnelDedupHash('share', 'token', 'copy', null, null), 'share:token:copy')
  assert.equal(makeFunnelDedupHash('share', 'token', 'copy', 'card', MENU_ID), `share:token:copy:card:${MENU_ID}`)
})
