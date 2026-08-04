import test from 'node:test'
import assert from 'node:assert/strict'
import { consultNarrative } from './consult-narrative'

test('相談案件を既存statusから3段へ導出する', () => {
  assert.equal(consultNarrative('received').title, 'MB Partnersが一緒に考えています')
  assert.equal(consultNarrative('in_progress').title, 'ご提案中')
  assert.equal(consultNarrative('confirmed').title, 'メニューが決まりました')
  assert.equal(consultNarrative('paid').title, 'メニューが決まりました')
})
