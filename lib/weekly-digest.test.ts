import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertDigestBoundary,
  buildDigestCopy,
  classifyDigestSegment,
  digestWeekKey,
  isDigestExcludedIdentity,
  selectDigestTip,
  signDigestUnsubscribe,
  verifyDigestUnsubscribe,
  type DigestTip,
} from './weekly-digest'

const NOW = new Date('2026-08-14T02:00:00.000Z')
const TIPS: DigestTip[] = Array.from({ length: 22 }, (_, i) => ({
  id: `tip-${i}`,
  serviceId: `service-${i % 3}`,
  name: `メニュー${i}`,
  shortDescription: 'こんな方がいたら、会話のきっかけにできます。',
  publishedAt: '2026-08-05T00:00:00.000Z',
}))

test('同partner同週は同じネタ、翌週は別のネタ', () => {
  const a = selectDigestTip('partner-a', NOW, TIPS)
  const b = selectDigestTip('partner-a', new Date('2026-08-15T02:00:00.000Z'), TIPS)
  const next = selectDigestTip('partner-a', new Date('2026-08-21T02:00:00.000Z'), TIPS)
  assert.equal(a.id, b.id)
  assert.notEqual(a.id, next.id)
  assert.equal(digestWeekKey(NOW), '2026-W33')
})

test('今週公開の新着が最優先', () => {
  const fresh = { ...TIPS[0], id: 'fresh', publishedAt: '2026-08-11T00:00:00.000Z' }
  assert.equal(selectDigestTip('partner-a', NOW, [...TIPS, fresh]).id, 'fresh')
})

test('3セグメントは設計§2.2どおり決定する', () => {
  assert.equal(classifyDigestSegment({ registeredAt: '2026-08-01T00:00:00Z', totalDeals: 0, progressCount: 0, lastDealAt: null }, NOW), 'new')
  assert.equal(classifyDigestSegment({ registeredAt: '2026-08-01T00:00:00Z', totalDeals: 1, progressCount: 1, lastDealAt: '2026-08-13T00:00:00Z' }, NOW), 'active')
  assert.equal(classifyDigestSegment({ registeredAt: '2026-06-01T00:00:00Z', totalDeals: 1, progressCount: 0, lastDealAt: '2026-07-01T00:00:00Z' }, NOW), 'quiet')
  assert.equal(classifyDigestSegment({ registeredAt: '2026-08-01T00:00:00Z', totalDeals: 1, progressCount: 0, lastDealAt: '2026-08-10T00:00:00Z' }, NOW), null)
})

test('内部シンクとcc-monitorは恒久除外', () => {
  assert.equal(isDigestExcludedIdentity('x@mb-system.internal'), true)
  assert.equal(isDigestExcludedIdentity('member@example.com', 'cc-monitor-01'), true)
  assert.equal(isDigestExcludedIdentity('member@example.com', 'ZZ1000', '山田'), false)
})

test('文面は金額境界を越えず、危険なネタ説明を安全文へ縮退する', () => {
  const copy = buildDigestCopy({
    segment: 'new', displayName: '山田 太郎', progressCount: 0, recentState: null, unreadCount: 1,
    socialProof: { referrals: 3, wins: 1, newPartners: 2 },
    tip: { ...TIPS[0], shortDescription: '報酬は¥30,000です' },
    tipUrl: 'https://mb-partners.app/r/a?src=digest', referUrl: 'https://mb-partners.app/app/refer?src=digest',
    consultUrl: 'https://mb-partners.app/app/refer?consult=1&src=digest', unsubscribeUrl: 'https://mb-partners.app/api/weekly-digest/unsubscribe?token=x',
  })
  assert.doesNotMatch(copy.text, /報酬|¥|30,000/)
  assert.match(copy.text, /あなたの現在地[\s\S]*先週、ネットワークでは 新しい紹介が3件・成約が1件 ありました[\s\S]*今週のネタ/)
  assert.doesNotThrow(() => assertDigestBoundary(copy.text.replaceAll(/https?:\/\/\S+/g, '')))
})

test('3セグメントsnapshotへ同じ証明行を挿入し、全0では行ごと省略する', () => {
  for (const segment of ['new', 'active', 'quiet'] as const) {
    const base = {
      segment,
      displayName: '山田 太郎',
      progressCount: segment === 'active' ? 2 : 0,
      recentState: segment === 'active' ? '対応中' : null,
      unreadCount: 0,
      tip: TIPS[0],
      tipUrl: 'https://mb-partners.app/r/a?src=digest',
      referUrl: 'https://mb-partners.app/app/refer?src=digest',
      consultUrl: 'https://mb-partners.app/app/refer?consult=1&src=digest',
      unsubscribeUrl: 'https://mb-partners.app/api/weekly-digest/unsubscribe?token=x',
    }
    const withProof = buildDigestCopy({ ...base, socialProof: { referrals: 2, wins: 1, newPartners: 9 } })
    const withoutProof = buildDigestCopy({ ...base, socialProof: { referrals: 0, wins: 0, newPartners: 9 } })
    assert.match(withProof.text, /あなたの現在地[\s\S]*先週、ネットワークでは 新しい紹介が2件・成約が1件 ありました[\s\S]*今週のネタ/)
    assert.doesNotMatch(withoutProof.text, /先週、ネットワークでは/)
    assert.doesNotMatch(withProof.text.match(/先週、ネットワークでは[^\n]+/)?.[0] ?? '', /山田|会社|株式会社|メニュー|報酬|受注額|粗利|委託費|[¥￥]/)
  }
})

test('配信停止tokenは署名・期限を検証する', () => {
  const token = signDigestUnsubscribe('partner-a', NOW.getTime() + 60_000, 'secret')
  assert.equal(verifyDigestUnsubscribe(token, NOW.getTime(), 'secret')?.partnerId, 'partner-a')
  assert.equal(verifyDigestUnsubscribe(`${token}x`, NOW.getTime(), 'secret'), null)
  assert.equal(verifyDigestUnsubscribe(token, NOW.getTime() + 120_000, 'secret'), null)
})
