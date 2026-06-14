'use client'

type MonthData = { ym: string; label: string; referral: number; direct: number; frontier: number }

// 目安配分: 直販50 / リファラル30 / フロンティア20
const TARGET = { direct: 50, referral: 30, frontier: 20 }

const CH = [
  { key: 'direct',   label: '直販',       color: '#0E0E14' },
  { key: 'referral', label: 'リファラル', color: 'var(--blue)' },
  { key: 'frontier', label: 'フロンティア', color: '#1E9E6A' },
] as const

export default function ChannelChart({
  monthlyData,
  directTotal,
  referralTotal,
  frontierTotal,
}: {
  monthlyData: MonthData[]
  directTotal: number
  referralTotal: number
  frontierTotal: number
}) {
  const maxVal = Math.max(...monthlyData.map(m => m.referral + m.direct + m.frontier), 1)
  const total  = directTotal + referralTotal + frontierTotal

  const actPct = {
    direct:   total > 0 ? Math.round(directTotal   / total * 100) : 0,
    referral: total > 0 ? Math.round(referralTotal / total * 100) : 0,
    frontier: total > 0 ? Math.round(frontierTotal / total * 100) : 0,
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: '.84rem' }}>チャネル別成約</b>
        <div style={{ display: 'flex', gap: 10, fontSize: '.6rem', color: 'var(--muted2)' }}>
          {CH.map(c => (
            <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color === 'var(--blue)' ? '#4733E6' : c.color, display: 'inline-block' }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Stacked bar: actual vs target */}
      <div style={{ padding: '12px 16px 8px' }}>
        {/* Actual */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700, width: 28, flexShrink: 0 }}>実績</span>
          {total > 0 ? (
            <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${actPct.direct}%`,   background: '#0E0E14', transition: 'width .6s ease' }} />
              <div style={{ width: `${actPct.referral}%`, background: '#4733E6', transition: 'width .6s ease' }} />
              <div style={{ width: `${actPct.frontier}%`, background: '#1E9E6A', transition: 'width .6s ease' }} />
            </div>
          ) : (
            <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--line)' }} />
          )}
          <span style={{ fontSize: '.58rem', color: 'var(--muted2)', width: 60, flexShrink: 0, textAlign: 'right' }}>
            {actPct.direct}/{actPct.referral}/{actPct.frontier}
          </span>
        </div>
        {/* Target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700, width: 28, flexShrink: 0 }}>目安</span>
          <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${TARGET.direct}%`,   background: '#0E0E14', opacity: .25 }} />
            <div style={{ width: `${TARGET.referral}%`, background: '#4733E6', opacity: .25 }} />
            <div style={{ width: `${TARGET.frontier}%`, background: '#1E9E6A', opacity: .25 }} />
          </div>
          <span style={{ fontSize: '.58rem', color: 'var(--muted2)', width: 60, flexShrink: 0, textAlign: 'right' }}>
            {TARGET.direct}/{TARGET.referral}/{TARGET.frontier}
          </span>
        </div>
      </div>

      {/* Monthly bars */}
      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
          {monthlyData.map(m => {
            const colTotal = m.direct + m.referral + m.frontier
            const dirH = maxVal > 0 ? Math.round((m.direct   / maxVal) * 72) : 0
            const refH = maxVal > 0 ? Math.round((m.referral / maxVal) * 72) : 0
            const froH = maxVal > 0 ? Math.round((m.frontier / maxVal) * 72) : 0
            return (
              <div key={m.ym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '100%', gap: 1 }}>
                  {dirH > 0 && <div style={{ height: dirH, background: '#0E0E14', borderRadius: (refH + froH) > 0 ? '0 0 3px 3px' : '3px', width: '100%' }} />}
                  {refH > 0 && <div style={{ height: refH, background: '#4733E6', width: '100%' }} />}
                  {froH > 0 && <div style={{ height: froH, background: '#1E9E6A', borderRadius: '3px 3px 0 0', width: '100%' }} />}
                  {colTotal === 0 && <div style={{ height: 3, background: 'var(--line)', borderRadius: 3, width: '100%' }} />}
                </div>
                <div style={{ fontSize: '.55rem', color: 'var(--muted)', marginTop: 4, fontFamily: 'Inter' }}>{m.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
