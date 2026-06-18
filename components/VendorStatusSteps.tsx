// app の案件ステータス・タイムライン（ステップ表示）を踏襲。vendor 案件カード/詳細で共通利用。
const STEPS = ['受付', '対応中', '成約', '完了']
const STEP_OF: Record<string, number> = { received: 0, in_progress: 1, confirmed: 2, paid: 3 }

export default function VendorStatusSteps({ status }: { status: string }) {
  if (status === 'lost') return <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 10 }}>この案件は見送り（不成立）となりました。</p>
  const step = STEP_OF[status] ?? 0
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 12 }}>
      {STEPS.map((label, i) => {
        const done = i <= step
        const isCurrent = i === step
        const color = i === 3 && done ? 'var(--green)' : 'var(--blue)'
        return (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
            {i > 0 && <span style={{ position: 'absolute', top: 6, right: '50%', width: '100%', height: 2, background: i <= step ? color : 'var(--line)' }} />}
            <span style={{ position: 'relative', zIndex: 1, width: isCurrent ? 14 : 12, height: isCurrent ? 14 : 12, borderRadius: '50%', background: done ? color : '#fff', border: `2px solid ${done ? color : 'var(--line)'}`, boxShadow: isCurrent ? `0 0 0 4px ${i === 3 ? 'var(--green-bg)' : 'var(--blue-bg)'}` : 'none' }} />
            <span style={{ fontSize: '.56rem', fontWeight: isCurrent ? 800 : 600, color: done ? 'var(--txt)' : 'var(--muted2)', marginTop: 6 }}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}
