/**
 * KpiCard / WaterRow — MBコンソール・ダッシュボードで確立したKPIカードと内訳（ウォーターフォール）行の単一ソース。
 * サプライヤー洗練（2026-07-14）: console/page.tsx のローカル実装をそのまま昇格（寸法・罫線・バー表現は不変）。
 * MBコンソールとサプライヤー・コンソールの両方がこれを描画＝乖離不能。表示のみ（money非接触）。
 */
import CountUp from '@/components/CountUp'

export function DeltaBadge({ cur, prev, format, suffix }: { cur: number; prev: number; format?: 'number' | 'yen'; suffix?: string }) {
  const diff = cur - prev
  const up = diff >= 0
  const color = diff === 0 ? 'var(--muted2)' : up ? 'var(--green)' : 'var(--red)'
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±'
  const value = Math.abs(diff).toLocaleString()
  const display = format === 'yen' ? `¥${sign}${value}` : `${sign}${value}${suffix ?? ''}`
  return (
    <span style={{ fontSize: '.58rem', fontWeight: 500, color }}>
      <span style={{ color: 'var(--muted2)', fontWeight: 400, marginRight: 4 }}>前月比</span>
      {display}
    </span>
  )
}

export function KpiIcon({ id }: { id: string }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const
  switch (id) {
    case 'deal':  return <svg {...p}><path d="M20 6L9 17l-5-5" /></svg>
    case 'yen':   return <svg {...p}><path d="M12 4l-4 7h8l-4-7zM12 11v9M8 14h8M8 17h8" /></svg>
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
    case 'alert': return <svg {...p}><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>
    case 'cost':  return <svg {...p}><path d="M12 2v20M17 7H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
    default:      return null
  }
}

// v2.2：KPI面は中立（塗りはヒーロー1面のみ）。アイコンタイルの色面を撤去し、数値は var(--txt) 固定。
export default function KpiCard({ label, value, suffix, format, icon, delta, sub }: {
  label: string; value: number; suffix?: string; format?: 'number' | 'yen'
  icon: string
  delta?: { cur: number; prev: number }; sub?: string
}) {
  return (
    <div className="card-hover" style={{
      background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: '10px', color: 'var(--t-tertiary)', fontWeight: 500, paddingTop: 4 }}>{label}</div>
        <span style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted2)',
        }}>
          <KpiIcon id={icon} />
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-sans), Inter', fontSize: '18px', fontWeight: 500, marginTop: 8, fontFeatureSettings: '"tnum" 1', letterSpacing: '-.02em', color: 'var(--txt)' }}>
        <CountUp value={value} format={format} />
        {suffix && <small style={{ fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 400, marginLeft: 3, color: 'var(--muted2)' }}>{suffix}</small>}
      </div>
      <div style={{ marginTop: 5, minHeight: 14 }}>
        {delta ? <DeltaBadge cur={delta.cur} prev={delta.prev} format={format} suffix={suffix} />
          : sub ? <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>{sub}</span> : null}
      </div>
    </div>
  )
}

/** お金の内訳（ウォーターフォール）の1行 — MBダッシュボード「お金の内訳」と同一表現（バー軌道= --s-2）。 */
export function WaterRow({ label, val, pct, color, minus, head, strong }: { label: string; val: number; pct: number; color: string; minus?: boolean; head?: boolean; strong?: boolean }) {
  return (
    <div style={{ padding: head ? '2px 0 9px' : '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: strong || head ? '.76rem' : '.68rem', fontWeight: 500, color: minus ? 'var(--muted2)' : 'var(--txt)' }}>{minus ? '− ' : ''}{label}</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: strong || head ? '.84rem' : '.72rem', fontWeight: 500, color: 'var(--txt)' }}>
          {minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}
        </span>
      </div>
      <div style={{ height: head || strong ? 9 : 7, borderRadius: 4, background: 'var(--s-2)', overflow: 'hidden' }}>
        <div className="bar-grow" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 4 }} />
      </div>
    </div>
  )
}
