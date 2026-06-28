'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const fmtD = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${Number(m[2])}/${Number(m[3])}` : iso }
const wd = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(d.getTime()) ? '' : '日月火水木金土'[d.getDay()] }

// MB提示の候補日から1つ選んで確定（双方向）。確定後は予定に昇格。
export default function SchedulePicker({ id, label, dates }: { id: string; label: string; dates: string[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [err, setErr] = useState('')

  async function confirm() {
    if (!sel) { setErr('候補日を選んでください'); return }
    setBusy(true); setErr('')
    const r = await fetch('/api/vendor/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schedule_id: id, chosen_date: sel }) })
    setBusy(false)
    if (r.ok) router.refresh()
    else { const d = await r.json().catch(() => ({})); setErr(d?.error ?? '確定に失敗しました') }
  }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--amber-bg)', borderRadius: 13, padding: '14px 15px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 20, padding: '2px 9px' }}>確定待ち</span>
        <b style={{ fontSize: '.78rem' }}>{label}</b>
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 9px' }}>MB から候補日が届いています。希望日を選んでください。</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {dates.map(d => {
          const on = sel === d
          return (
            <button key={d} onClick={() => setSel(d)} type="button"
              style={{ minWidth: 64, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                border: `1.5px solid ${on ? 'var(--c-blue)' : 'var(--line)'}`, background: on ? 'var(--c-blue)' : '#fff', color: on ? '#fff' : 'var(--txt)' }}>
              <div style={{ fontFamily: 'Inter', fontSize: '.86rem', fontWeight: 800 }}>{fmtD(d)}</div>
              <div style={{ fontSize: '.54rem', opacity: .8 }}>（{wd(d)}）</div>
            </button>
          )
        })}
      </div>
      {err && <p style={{ fontSize: '.64rem', color: 'var(--red)', marginBottom: 8 }}>{err}</p>}
      <button onClick={confirm} disabled={busy || !sel} className="ui-btn ui-btn--primary" style={{ width: '100%', justifyContent: 'center' }}>
        {busy ? '確定中…' : 'この日程で確定する'}
      </button>
    </div>
  )
}
