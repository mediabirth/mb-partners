'use client'
import { useState } from 'react'

export type DealTask = {
  id: string; label: string; kind: string; required: boolean; done: boolean; note?: string | null; sort: number
}

// v2.1：案件のタスク＝「状態表示」。完了＝accent塗りドット＋✓＋右端「完了」／未完了＝薄い輪郭ドット。
// 操作できる形（checkbox）は使わない（運営更新＋ヒヤリング自動のみ）。ヒヤリングだけ行直下にインデントで入力＋保存。
// ★保存API・自動✓・データは不変。表示・配置のみ。
export default function TaskChecklist({ tasks: initial, descriptions = {}, hearing }: {
  tasks: DealTask[]
  descriptions?: Record<string, string>
  hearing?: { dealId: string; initial: string; done: boolean } | null
}) {
  // ② ヒヤリング（入力枠つき）は常に最下部（表示順のみ・sortデータは不変）。
  const isHearingRow = (t: DealTask) => (t.kind ?? '').includes('ヒヤリング') || (t.label ?? '').includes('ヒヤリング')
  const tasks = [...initial].sort((a, b) => (isHearingRow(a) ? 1 : 0) - (isHearingRow(b) ? 1 : 0) || a.sort - b.sort)
  const [openInfo, setOpenInfo] = useState<string | null>(null)
  const [hearingDone, setHearingDone] = useState(!!hearing?.done)

  return (
    <div style={{ padding: '24px 20px 0' }}>
      {/* ④ 呼称は「協力タスク」に統一（タスク群の名称としてのみ） */}
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>協力タスク</div>
      <div>
        {tasks.map(t => {
          const desc = descriptions[t.label]
          const isHearing = !!hearing && ((t.kind ?? '').includes('ヒヤリング') || (t.label ?? '').includes('ヒヤリング'))
          const done = t.done || (isHearing && hearingDone)
          return (
            <div key={t.id} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: '0.5px solid var(--line)' }}>
                <span className={done ? 'check-in' : undefined} style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--c-blue)' : '#fff', border: done ? 'none' : '1.5px solid var(--line)', color: '#fff' }}>
                  {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <span style={{ fontSize: 14, fontWeight: 400, color: done ? 'var(--muted2)' : 'var(--txt)' }}>{t.label}</span>
                {desc && (
                  <button type="button" onClick={() => setOpenInfo(v => v === t.label ? null : t.label)} aria-label="説明"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', display: 'flex', flexShrink: 0, marginLeft: 1 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                  </button>
                )}
                <span style={{ flex: 1 }} />
                {done && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-blue)', flexShrink: 0 }}>完了</span>}
              </div>
              {openInfo === t.label && desc && (
                <>
                  <div onClick={() => setOpenInfo(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                  <div className="pop-in" style={{ position: 'relative', zIndex: 21, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 10, boxShadow: '0 6px 24px rgba(14,14,20,.12)', padding: '10px 12px', margin: '0 0 8px 28px' }}>
                    <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{desc}</p>
                  </div>
                </>
              )}
              {isHearing && <HearingInline dealId={hearing!.dealId} initial={hearing!.initial} onSaved={() => setHearingDone(true)} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ヒヤリング入力（該当タスク行の直下・インデント）。保存＝Secondary小（右寄せ）。保存で親の完了表示を更新。
function HearingInline({ dealId, initial, onSaved }: { dealId: string; initial: string; onSaved: () => void }) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  async function save() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/app/deals/${dealId}/hearing`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok) { if (j.done) onSaved(); setMsg('保存しました') }
      else setMsg(j.error || '保存に失敗しました')
    } catch { setMsg('通信に失敗しました') } finally { setSaving(false) }
  }
  return (
    <div style={{ padding: '2px 0 14px 28px' }}>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={4000}
        placeholder="予算感・希望時期・現状の課題 などを記入して保存"
        style={{ width: '100%', border: '0.5px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6, resize: 'vertical' }} />
      {/* 文字数カウンタ（右下・静かな表示・サーバ側は超過を400で拒否＝同じ4000上限） */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
        {msg && <span style={{ fontSize: 11, color: msg.includes('失敗') || msg.includes('通信') ? 'var(--red)' : 'var(--muted2)' }}>{msg}</span>}
        <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{text.length}/4000</span>
        <button onClick={save} disabled={saving}
          style={{ height: 34, padding: '0 16px', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', color: 'var(--c-blue)', background: 'transparent', border: '0.5px solid var(--line)', borderRadius: 8, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
