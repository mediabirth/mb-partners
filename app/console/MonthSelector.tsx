'use client'
import { useRouter, usePathname } from 'next/navigation'

/**
 * ダッシュボードの月セレクタ（◀▶ ＋ ドロップダウン）。
 * 選択月を ?m=YYYY-MM としてURLに反映し、サーバー側で再集計させる。
 * months は新しい順（降順）で渡す。current は当月キー。
 */
export default function MonthSelector({
  months, selected, current,
}: { months: string[]; selected: string; current: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const idx = months.indexOf(selected)
  // months降順なので「前の月（古い）」= idx+1、「次の月（新しい）」= idx-1
  const olderKey = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null
  const newerKey = idx > 0 ? months[idx - 1] : null

  const go = (m: string) => {
    if (m === current) router.push(pathname)
    else router.push(`${pathname}?m=${m}`)
  }

  const fmt = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y}年${Number(mo)}月`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={() => olderKey && go(olderKey)}
        disabled={!olderKey}
        aria-label="前の月"
        className="lift"
        style={arrowStyle(!olderKey)}
      >‹</button>

      <div style={{ position: 'relative' }}>
        <select
          value={selected}
          onChange={e => go(e.target.value)}
          style={{
            appearance: 'none', WebkitAppearance: 'none',
            fontFamily: 'inherit', fontSize: '.78rem', fontWeight: 700, color: 'var(--txt)',
            background: '#fff', border: '1px solid var(--line)', borderRadius: 9,
            padding: '7px 30px 7px 13px', cursor: 'pointer', outline: 'none', minWidth: 124,
          }}
        >
          {months.map(m => (
            <option key={m} value={m}>{fmt(m)}{m === current ? '（当月）' : ''}</option>
          ))}
        </select>
        <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted)', fontSize: '.6rem' }}>▼</span>
      </div>

      <button
        type="button"
        onClick={() => newerKey && go(newerKey)}
        disabled={!newerKey}
        aria-label="次の月"
        className="lift"
        style={arrowStyle(!newerKey)}
      >›</button>
    </div>
  )
}

function arrowStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30, height: 32, borderRadius: 9, border: '1px solid var(--line)',
    background: '#fff', color: disabled ? 'var(--line)' : 'var(--muted)',
    fontSize: '1rem', fontWeight: 700, lineHeight: 1,
    cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit',
  }
}
