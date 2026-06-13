'use client'

type MonthData = { ym: string; label: string; referral: number; direct: number }

export default function ChannelChart({
  monthlyData,
  referralTotal,
  directTotal,
}: {
  monthlyData: MonthData[]
  referralTotal: number
  directTotal: number
}) {
  const maxVal = Math.max(...monthlyData.map(m => m.referral + m.direct), 1)
  const total = referralTotal + directTotal

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14 }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: '.84rem' }}>チャネル別成約</b>
        <div style={{ display: 'flex', gap: 12, fontSize: '.62rem', color: 'var(--muted2)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />
            紹介 {referralTotal}件
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#BBBDC8', display: 'inline-block' }} />
            営業 {directTotal}件
          </span>
        </div>
      </div>

      {/* Summary pie-like bar */}
      {total > 0 && (
        <div style={{ padding: '12px 16px 8px' }}>
          <div style={{ height: 8, borderRadius: 4, background: '#BBBDC8', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--blue)', width: `${Math.round(referralTotal / total * 100)}%`, transition: 'width .6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '.6rem', color: 'var(--muted2)' }}>
            <span>紹介 {total > 0 ? Math.round(referralTotal / total * 100) : 0}%</span>
            <span>営業 {total > 0 ? Math.round(directTotal / total * 100) : 0}%</span>
          </div>
        </div>
      )}

      {/* Monthly bars */}
      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
          {monthlyData.map(m => {
            const colTotal = m.referral + m.direct
            const refH = maxVal > 0 ? Math.round((m.referral / maxVal) * 72) : 0
            const dirH = maxVal > 0 ? Math.round((m.direct / maxVal) * 72) : 0
            return (
              <div key={m.ym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column-reverse', width: '100%', gap: 1 }}>
                  {dirH > 0 && <div style={{ height: dirH, background: '#BBBDC8', borderRadius: refH > 0 ? '0 0 3px 3px' : '3px 3px 3px 3px', width: '100%' }} />}
                  {refH > 0 && <div style={{ height: refH, background: 'var(--blue)', borderRadius: dirH > 0 ? '3px 3px 0 0' : '3px 3px 3px 3px', width: '100%' }} />}
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
