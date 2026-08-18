import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFunnelSource } from './funnel-attribution'
import {
  buildNorthStarSnapshot,
  formatMedianDays,
  formatSecondReferralRate,
  jstMondayStart,
  WON_EVENT_BODY,
} from './north-star'
import { WON_EVENT_BODY as SOCIAL_PROOF_WON_EVENT_BODY } from './social-proof'

const partners = [
  { id: 'a', code: 'A', name: 'Aさん', email: 'a@example.com', isSystem: false },
  { id: 'b', code: 'B', name: 'Bさん', email: 'b@example.com', isSystem: false },
  { id: 'c', code: 'C', name: 'Cさん', email: 'c@example.com', isSystem: false },
]

test('2回目紹介率・中央値・3ステージを正典定義で計算する', () => {
  const snapshot = buildNorthStarSnapshot({
    partners,
    deals: [
      { partnerId: 'a', createdAt: '2026-08-01T00:00:00.000Z', src: null },
      { partnerId: 'a', createdAt: '2026-08-05T12:00:00.000Z', src: 'digest' },
      { partnerId: 'b', createdAt: '2026-08-03T00:00:00.000Z', src: null },
    ],
    funnelEvents: [], mails: [], wins: [], now: new Date('2026-08-18T02:00:00.000Z'),
  })
  assert.equal(formatSecondReferralRate(snapshot), '50%（n=1/2）')
  assert.equal(snapshot.medianDaysToSecond, 4.5)
  assert.equal(formatMedianDays(snapshot.medianDaysToSecond), '4.5日')
  assert.equal(snapshot.stoppedAfterOne, 1)
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot.stages).map(([key, rows]) => [key, rows.length])), { none: 1, once: 1, repeat: 1 })
  assert.deepEqual(snapshot.stages.repeat.map(row => row.code), ['A'])
})

test('分母0は率を誇張せず「—」、中央値も「—」にする', () => {
  const snapshot = buildNorthStarSnapshot({ partners, deals: [], funnelEvents: [], mails: [], wins: [], now: new Date('2026-08-18T02:00:00.000Z') })
  assert.equal(formatSecondReferralRate(snapshot), '—（まだ最初の紹介がありません）')
  assert.equal(formatMedianDays(snapshot.medianDaysToSecond), '—')
})

test('内部・監視用identityを紹介率とステージから除外する', () => {
  const excluded = [
    { id: 'system', code: 'MBHOUSE', name: '直営', email: 'owner@example.com', isSystem: true },
    { id: 'mail', code: 'X', name: '内部', email: 'x@mb-system.internal', isSystem: false },
    { id: 'monitor', code: 'CC-MONITOR', name: '監視', email: 'monitor@example.com', isSystem: false },
  ]
  const snapshot = buildNorthStarSnapshot({
    partners: [...partners, ...excluded],
    deals: excluded.flatMap(partner => [
      { partnerId: partner.id, createdAt: '2026-08-17T00:00:00.000Z', src: null as null },
      { partnerId: partner.id, createdAt: '2026-08-18T00:00:00.000Z', src: null as null },
    ]),
    funnelEvents: [], mails: [], wins: [], now: new Date('2026-08-18T02:00:00.000Z'),
  })
  assert.equal(snapshot.referrers, 0)
  assert.equal(snapshot.stages.none.length, 3)
})

test('直近8週をJST月曜境界で連続生成し、全0週も残す', () => {
  assert.equal(jstMondayStart(new Date('2026-08-16T14:59:59.999Z')).toISOString(), '2026-08-09T15:00:00.000Z')
  assert.equal(jstMondayStart(new Date('2026-08-16T15:00:00.000Z')).toISOString(), '2026-08-16T15:00:00.000Z')
  const snapshot = buildNorthStarSnapshot({
    partners,
    deals: [
      { partnerId: 'a', createdAt: '2026-08-16T14:59:59.999Z', src: 'card' },
      { partnerId: 'a', createdAt: '2026-08-16T15:00:00.000Z', src: 'digest' },
    ],
    funnelEvents: [
      { eventType: 'landing_view', partnerId: 'a', src: 'digest', createdAt: '2026-08-16T15:00:00.000Z' },
      { eventType: 'landing_view', partnerId: 'a', src: 'card', createdAt: '2026-08-16T14:59:59.999Z' },
      { eventType: 'share', partnerId: 'a', src: null, createdAt: '2026-08-16T15:00:00.000Z' },
    ],
    mails: [{ templateKey: 'weekly-digest', status: 'sent', createdAt: '2026-08-16T15:00:00.000Z' }],
    wins: [{ partnerId: 'a', createdAt: '2026-08-16T15:00:00.000Z' }],
    now: new Date('2026-08-18T02:00:00.000Z'),
  })
  assert.equal(snapshot.weeks.length, 8)
  assert.equal(snapshot.weeks.at(-2)?.cardViews, 1)
  assert.equal(snapshot.weeks.at(-2)?.referrals, 1)
  assert.deepEqual(snapshot.weeks.at(-1), {
    key: '2026-08-17', label: '8/17〜8/23', start: '2026-08-16T15:00:00.000Z', end: '2026-08-23T15:00:00.000Z',
    digestSent: 1, digestViews: 1, cardViews: 0, shares: 1, referrals: 1, attributedReferrals: 1, wins: 1,
  })
  assert.equal(snapshot.weeks.filter(week => Object.values(week).every(value => typeof value !== 'number' || value === 0)).length, 6)
})

test('src allowlistはdigest/cardのみを受け、決定性と成約定義共有を守る', () => {
  assert.equal(normalizeFunnelSource('digest'), 'digest')
  assert.equal(normalizeFunnelSource('card'), 'card')
  for (const value of [undefined, null, '', 'DIGEST', 'mail', 1, {}, ['digest']]) assert.equal(normalizeFunnelSource(value), null)
  assert.equal(WON_EVENT_BODY, SOCIAL_PROOF_WON_EVENT_BODY)
  const input = { partners, deals: [], funnelEvents: [], mails: [], wins: [], now: new Date('2026-08-18T02:00:00.000Z') }
  assert.deepEqual(buildNorthStarSnapshot(input), buildNorthStarSnapshot(input))
})
