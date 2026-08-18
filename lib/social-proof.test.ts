import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SocialProofCard from '@/components/SocialProofCard'
import { buildSocialProofCopy, socialProofWindowStart, type SocialProofCounts } from './social-proof'

const FORBIDDEN = /報酬|受注額|売上額|粗利|委託費|手数料|振込額|支払額|会社|株式会社|メニュー|山田|佐藤|[¥￥$€£]|\d+(?:\.\d+)?%/i

test('APPは0の行を抑制し、全0ならカード用行が空になる', () => {
  assert.deepEqual(buildSocialProofCopy({ referrals: 0, wins: 0, newPartners: 0 }, 30), { lines: [], digestLine: null })
  assert.deepEqual(buildSocialProofCopy({ referrals: 1, wins: 0, newPartners: 0 }, 30).lines, ['この30日で、新しい紹介が 1件 動きました'])
  assert.deepEqual(buildSocialProofCopy({ referrals: 0, wins: 2, newPartners: 0 }, 30).lines, ['2件が成約になりました'])
  assert.deepEqual(buildSocialProofCopy({ referrals: 0, wins: 0, newPartners: 3 }, 30).lines, ['新しい仲間が 3人 加わりました'])
  assert.equal(renderToStaticMarkup(createElement(SocialProofCard, { counts: { referrals: 0, wins: 0, newPartners: 0 } })), '')
  assert.match(renderToStaticMarkup(createElement(SocialProofCard, { counts: { referrals: 1, wins: 0, newPartners: 0 } })), /data-social-proof="network-heartbeat"/)
})

test('1件・複数件をそのまま表示し、同じ入力は決定的', () => {
  const counts: SocialProofCounts = { referrals: 1, wins: 2, newPartners: 4 }
  const first = buildSocialProofCopy(counts, 30)
  assert.deepEqual(first, buildSocialProofCopy(counts, 30))
  assert.deepEqual(first.lines, [
    'この30日で、新しい紹介が 1件 動きました',
    '2件が成約になりました',
    '新しい仲間が 4人 加わりました',
  ])
})

test('ダイジェストは紹介・成約の0句を省略し、両方0なら行ごと消す', () => {
  assert.equal(buildSocialProofCopy({ referrals: 0, wins: 0, newPartners: 9 }, 7).digestLine, null)
  assert.equal(buildSocialProofCopy({ referrals: 1, wins: 0, newPartners: 0 }, 7).digestLine, '先週、ネットワークでは 新しい紹介が1件 ありました')
  assert.equal(buildSocialProofCopy({ referrals: 0, wins: 2, newPartners: 0 }, 7).digestLine, '先週、ネットワークでは 成約が2件 ありました')
  assert.equal(buildSocialProofCopy({ referrals: 3, wins: 4, newPartners: 0 }, 7).digestLine, '先週、ネットワークでは 新しい紹介が3件・成約が4件 ありました')
})

test('生成文面にmoney語・名前・社名・メニュー名の入力経路がない', () => {
  const copy = buildSocialProofCopy({ referrals: 123, wins: 45, newPartners: 6 }, 30)
  assert.doesNotMatch([...copy.lines, copy.digestLine ?? ''].join('\n'), FORBIDDEN)
})

test('期間境界はJST暦日で決定する', () => {
  const now = new Date('2026-08-18T02:30:00.000Z') // 11:30 JST
  assert.equal(socialProofWindowStart(now, 7), '2026-08-11T15:00:00.000Z')
  assert.equal(socialProofWindowStart(now, 30), '2026-07-19T15:00:00.000Z')
})
