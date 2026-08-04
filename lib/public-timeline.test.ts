import assert from 'node:assert/strict'
import test from 'node:test'
import { publicTimelineKind, toPublicTimeline } from './public-timeline'

test('公開許可された進行イベントだけを平易語へ変換する', () => {
  const items = toPublicTimeline([
    { id: '1', body: '担当が決まりました', created_at: '2026-07-27T00:00:00Z' },
    { id: '2', body: 'ステータスを「対応中」に変更しました', created_at: '2026-07-27T01:00:00Z' },
    { id: '3', body: 'ステータスを「成約」に変更しました', created_at: '2026-07-27T02:00:00Z' },
    { id: '4', body: '納品が完了しました', created_at: '2026-07-27T03:00:00Z' },
  ])
  assert.deepEqual(items.map(x => [x.kind, x.text]), [
    ['director_assigned', '担当が決まりました'],
    ['work_started', '対応を始めました'],
    ['menu_confirmed', 'メニューが決まりました'],
    ['delivery_completed', '納品が完了しました'],
  ])
})

test('未知イベントと金額系イベントは default-deny', () => {
  const forbidden = [
    '受注額を入力: ¥987,654,321',
    '委託費 ¥120,000',
    '経費を承認しました',
    '請求済にしました',
    '報酬を確定しました',
    'fee_snapshot=secret',
    'supplier_chargesを作成',
    '担当が決まりました 委託費 ¥1',
    'ステータスを「対応中」に変更しました（報酬 ¥1）',
  ]
  assert.deepEqual(toPublicTimeline(forbidden.map((body, i) => ({ id: String(i), body, created_at: '' }))), [])
  for (const body of forbidden) assert.equal(publicTimelineKind(body), null)
})

test('空本文も公開しない', () => {
  assert.equal(publicTimelineKind(null), null)
  assert.equal(publicTimelineKind(''), null)
})
