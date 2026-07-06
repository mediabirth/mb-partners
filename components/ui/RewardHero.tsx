/**
 * F-4：報酬ヒーロー（app=紹介報酬 / vendor=デリバリー支払 で同一の見え方）。表示のみ・計算は各サーフェス。
 * 「報酬」という同じ概念として一貫したグラデーション・ヒーロー＋サマリ3項目。
 */
import React from 'react'
import CountUp from '@/components/CountUp'

export type RewardHeroItem = { key: string; label: string; value: number; format?: 'number' | 'yen'; suffix?: string }

export default function RewardHero({ label, amount, items }: {
  label: string
  amount: number
  items: RewardHeroItem[]
}) {
  return (
    <div style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', borderRadius: 18, padding: '24px 22px 18px', color: '#fff' }}>
      <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.5rem', fontFeatureSettings: '"tnum"', letterSpacing: '-.022em', lineHeight: 1.05 }}>
        <span style={{ fontSize: '1.04rem', fontWeight: 600, opacity: .78, marginRight: 4 }}>¥</span>
        <CountUp value={amount} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 15, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)' }}>
        {items.map(it => (
          <div key={it.key} style={{ fontSize: '.6rem', opacity: .85 }}>
            {it.label}
            <b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>
              <CountUp value={it.value} format={it.format} />{it.suffix}
            </b>
          </div>
        ))}
      </div>
    </div>
  )
}
