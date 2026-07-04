import { redirect } from 'next/navigation'
import { loadVendorBundle } from '@/lib/vendor-data'
import { VENDOR_EVENT_TYPE } from '@/lib/vendor-status'
import { customerHonorific } from '@/lib/customer'
import SchedulePicker from './SchedulePicker'

export const runtime = 'edge'

const fmtFull = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso; const w = '日月火水木金土'[new Date(iso + 'T00:00:00').getDay()] ?? ''; return `${Number(m[2])}月${Number(m[3])}日（${w}）` }

export default async function VendorSchedule() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')

  const labelOf = (aid: string) => { const d = b.assignments.find(a => a.id === aid)?.deal; return (d && customerHonorific(d)) || '案件' }
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
          <h3 style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 9 }}>日程の確定待ち</h3>
          {pending.map(s => (
            <SchedulePicker key={s.id} id={s.id} label={`${s.label ?? '日程'} ・ ${labelOf(s.assignment_id)}`} dates={s.proposed_dates ?? []} />
          ))}
        </div>
      )}

      {/* 今月の予定 */}
      <div style={{ padding: '14px 20px 4px' }}>
        <h3 style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 9 }}>これからの予定</h3>
        {events.length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', padding: '6px 2px' }}>予定はありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            {events.map((s, i) => {
              const tc = VENDOR_EVENT_TYPE[s.event_type ?? ''] ?? { c: 'var(--muted2)', bg: 'var(--bg2)' }
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: i < events.length - 1 ? '0.5px solid var(--line)' : 'none' }}>
                  <div style={{ textAlign: 'center', flexShrink: 0, width: 46 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: '1.1rem', fontWeight: 500, lineHeight: 1, color: 'var(--txt)' }}>{s.event_date ? Number(s.event_date.slice(8, 10)) : ''}</div>
                    <div style={{ fontSize: '.5rem', color: 'var(--muted2)', marginTop: 2 }}>{s.event_date ? `${Number(s.event_date.slice(5, 7))}月` : ''}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 500 }}>{s.label ?? s.event_type}</div>
                    <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1 }}>{labelOf(s.assignment_id)}{s.event_date ? ` ・ ${fmtFull(s.event_date)}` : ''}</div>
                  </div>
                  {/* 種別＝6pxドット+テキスト（塗りピル廃止・色は単一ソース） */}
                  {s.event_type && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc.c, display: 'inline-block' }} />
                      <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{s.event_type}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 磨き③: 「カレンダーと連携（近日対応）」カードは操作不能の張りぼてのため撤去（実装時に復活） */}
    </div>
  )
}
