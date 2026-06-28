import { redirect } from 'next/navigation'
import { loadVendorBundle } from '@/lib/vendor-data'
import SchedulePicker from './SchedulePicker'

export const runtime = 'edge'

const fmtFull = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso; const w = '日月火水木金土'[new Date(iso + 'T00:00:00').getDay()] ?? ''; return `${Number(m[2])}月${Number(m[3])}日（${w}）` }
const TYPE_COLOR: Record<string, { c: string; bg: string }> = {
  納品期限: { c: 'var(--red)', bg: 'var(--red-bg)' },
  撮影: { c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  クローズ: { c: 'var(--green)', bg: 'var(--green-bg)' },
  打合せ: { c: 'var(--amber)', bg: 'var(--amber-bg)' },
}

export default async function VendorSchedule() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')

  const labelOf = (aid: string) => b.assignments.find(a => a.id === aid)?.deal?.customer_name ?? '案件'
  const pending = b.schedule.filter(s => s.row_type === 'proposal' && s.status === 'pending')
  // 予定＝event 行 ＋ 確定済みの proposal（event_date 入り）。日付順。
  const events = b.schedule
    .filter(s => (s.row_type === 'event' || s.status === 'confirmed') && s.event_date)
    .sort((x, y) => (x.event_date ?? '').localeCompare(y.event_date ?? ''))

  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 4px' }}>
        <h2 className="ty-h2">スケジュール</h2>
      </div>

      {/* 日程の確定待ち（双方向） */}
      {pending.length > 0 && (
        <div style={{ padding: '14px 20px 4px' }}>
          <h3 style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 9 }}>日程の確定待ち</h3>
          {pending.map(s => (
            <SchedulePicker key={s.id} id={s.id} label={`${s.label ?? '日程'} · ${labelOf(s.assignment_id)}`} dates={s.proposed_dates ?? []} />
          ))}
        </div>
      )}

      {/* 今月の予定 */}
      <div style={{ padding: '14px 20px 4px' }}>
        <h3 style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 9 }}>これからの予定</h3>
        {events.length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', padding: '6px 2px' }}>予定はありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            {events.map((s, i) => {
              const tc = TYPE_COLOR[s.event_type ?? ''] ?? { c: 'var(--muted2)', bg: 'var(--bg2)' }
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: i < events.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0, width: 46 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 800, lineHeight: 1, color: tc.c }}>{s.event_date ? Number(s.event_date.slice(8, 10)) : ''}</div>
                    <div style={{ fontSize: '.5rem', color: 'var(--muted2)', marginTop: 2 }}>{s.event_date ? `${Number(s.event_date.slice(5, 7))}月` : ''}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 700 }}>{s.label ?? s.event_type}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>{labelOf(s.assignment_id)}{s.event_date ? ` · ${fmtFull(s.event_date)}` : ''}</div>
                  </div>
                  {s.event_type && <span style={{ flexShrink: 0, fontSize: '.54rem', fontWeight: 700, color: tc.c, background: tc.bg, borderRadius: 20, padding: '2px 9px' }}>{s.event_type}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* カレンダーと連携 */}
      <div style={{ padding: '16px 20px 28px' }}>
        <div style={{ background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 13, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 10, background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-blue)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M3 9.5h18M8 3v3M16 3v3" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.74rem', fontWeight: 800 }}>カレンダーと連携</div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>納品期限・撮影・打合せをお使いのカレンダーへ自動で取り込めます（近日対応）。</div>
          </div>
        </div>
      </div>
    </div>
  )
}
