'use client'

export type Slot = { start: string; end: string }
export type Day = { date: string; label: string; weekday?: string; count?: number; slots: Slot[] }

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

/**
 * 共通 予約スロット選択UI（純UI部品・表示と選択だけ）。
 * fetch も確定もしない：データ(days[])は親から、選択結果は onSelect で親へ返す。
 * 日付チップ（枠数表示・空き0は自動グレーアウト&disabled）＋ 3列の時間グリッド（ワンタップ選択）。
 * BookingDrawer（in-app）と /book（公開予約リンク）で共有する基準UI。
 */
export default function SlotPicker({
  days, selectedDate, selectedSlot, onSelectDate, onSelectSlot,
}: {
  days: Day[]
  selectedDate: string | null
  selectedSlot: Slot | null
  onSelectDate: (date: string) => void
  onSelectSlot: (slot: Slot) => void
  connected?: boolean
  busyChecked?: boolean
}) {
  const day = days.find(d => d.date === selectedDate) ?? null

  return (
    <>
      {/* 日付チップ（空き枠数を表示・空きのない日はグレーアウト） */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 14 }}>
        {days.map(d => {
          const active = d.date === selectedDate
          const empty = (d.count ?? d.slots.length) === 0
          return (
            <button key={d.date} onClick={() => { if (!empty) onSelectDate(d.date) }} disabled={empty}
              style={{
                flexShrink: 0, minWidth: 56, padding: '7px 11px', borderRadius: 11,
                border: `1.5px solid ${active ? 'var(--blue)' : empty ? 'var(--line)' : 'var(--blue-bg)'}`,
                background: active ? 'var(--blue)' : empty ? 'var(--bg2)' : '#fff',
                color: active ? '#fff' : empty ? 'var(--muted2)' : 'var(--txt)',
                opacity: empty ? .55 : 1, cursor: empty ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'center',
              }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800 }}>{d.label}{d.weekday ? `(${d.weekday})` : ''}</div>
              <div style={{ fontSize: '.54rem', fontWeight: 700, marginTop: 2, color: active ? 'rgba(255,255,255,.9)' : empty ? 'var(--muted2)' : 'var(--blue)' }}>
                {empty ? '満' : `${d.count ?? d.slots.length}枠`}
              </div>
            </button>
          )
        })}
      </div>
      {/* 時間枠（即時表示）。ワンタップ＝選択（即予約はしない） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {(day?.slots ?? []).map(s => {
          const sel = selectedSlot?.start === s.start
          return (
            <button key={s.start} onClick={() => onSelectSlot(s)} className="lift"
              style={{ padding: '11px 0', borderRadius: 10, fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter', cursor: 'pointer',
                border: `1.5px solid ${sel ? 'var(--blue)' : 'var(--blue-bg)'}`,
                background: sel ? 'var(--blue)' : 'var(--blue-bg2)', color: sel ? '#fff' : 'var(--blue-dk)' }}>
              {fmtTime(s.start)}
            </button>
          )
        })}
      </div>
    </>
  )
}
