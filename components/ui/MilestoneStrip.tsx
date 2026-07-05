/**
 * 通水P3「循環」: 累計報酬のマイルストーン（静音・非ゲーミフィケーション）。
 * 既存 deals（確定/支払済）の税抜累計から「これまでの積み上げ」と「次の節目」を淡く可視化するだけ。
 *  - お金の計算・確定・payout には一切非接触（表示専用の合算のみ）。
 *  - v2.2/静音: バッジ・紙吹雪・煽り無し。罫線トラック＋--c-blue の細い充填＋muted文言。
 *  - 累計0のときは出さない（ゼロ状態を煽らない）。
 */
const LADDER = [100_000, 300_000, 500_000, 1_000_000, 3_000_000, 5_000_000, 10_000_000, 30_000_000, 50_000_000, 100_000_000]

function fmt(n: number): string {
  if (n >= 100_000_000) return `¥${(n / 100_000_000).toFixed(n % 100_000_000 ? 1 : 0)}億`
  if (n >= 10_000) return `¥${(n / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}万`
  return `¥${n.toLocaleString()}`
}

export default function MilestoneStrip({ cumulative }: { cumulative: number }) {
  if (!cumulative || cumulative <= 0) return null
  const reachedIdx = LADDER.filter(m => cumulative >= m).length - 1  // -1 = まだ最初の節目未達
  const prev = reachedIdx >= 0 ? LADDER[reachedIdx] : 0
  const next = LADDER[reachedIdx + 1] ?? null
  const segFrom = prev
  const segTo = next ?? LADDER[LADDER.length - 1]
  const pct = next ? Math.min(100, Math.round(((cumulative - segFrom) / (segTo - segFrom)) * 100)) : 100
  const remain = next ? next - cumulative : 0

  return (
    <div style={{ margin: '14px 20px 0', padding: '14px 16px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={{ fontSize: '.66rem', color: 'var(--muted2)', fontWeight: 500 }}>これまでの累計報酬（税抜）</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.92rem', fontWeight: 500, letterSpacing: '-.015em' }}>¥{cumulative.toLocaleString()}</span>
      </div>
      {/* 細いトラック＋充填（reached区間は淡く、現区間の進捗を --c-blue で） */}
      <div style={{ position: 'relative', height: 4, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'var(--c-blue)', borderRadius: 3, transition: 'width .5s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7, fontSize: '.6rem', color: 'var(--muted)' }}>
        <span>{reachedIdx >= 0 ? `${fmt(prev)} 到達` : 'スタート'}</span>
        {next
          ? <span>次の節目 <span style={{ color: 'var(--muted2)', fontWeight: 500 }}>{fmt(next)}</span> まで あと {fmt(remain)}</span>
          : <span style={{ color: 'var(--c-blue)', fontWeight: 500 }}>最高段階に到達</span>}
      </div>
    </div>
  )
}
