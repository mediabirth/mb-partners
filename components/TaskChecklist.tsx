'use client'
import { useState } from 'react'

export type DealTask = {
  id: string; label: string; kind: string; required: boolean; done: boolean; note?: string | null; sort: number
}

/**
 * 案件の対応タスク（進捗の可視化・読み取り専用）。パートナーはチェックを操作できない（運営が確認して更新）。
 * v3.1：個別チェックリスト＋ⓘ説明（cooperation_task_templates.description 由来）。色は accent＋neutral のみ。
 */
export default function TaskChecklist({ tasks: initial, descriptions = {} }: { tasks: DealTask[]; descriptions?: Record<string, string> }) {
  const tasks = [...initial].sort((a, b) => a.sort - b.sort)
  const required = tasks.filter(t => t.required)
  const doneReq = required.filter(t => t.done).length
  const [openInfo, setOpenInfo] = useState<string | null>(null)

  return (
    <div style={{ padding: '24px 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>あなたのタスク</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted2)' }}>{doneReq}/{required.length}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted2)', margin: '0 0 8px', lineHeight: 1.6 }}>
        達成状況は運営が確認して更新します。
      </p>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tasks.map(t => {
          const desc = descriptions[t.label]
          return (
            <div key={t.id} style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: '0.5px solid var(--line)' }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.done ? 'var(--c-blue)' : '#fff', border: `1.5px solid ${t.done ? 'var(--c-blue)' : 'var(--line)'}`, color: '#fff' }}>
                  {t.done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: t.done ? 'var(--muted2)' : 'var(--txt)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                {desc && (
                  <button type="button" onClick={() => setOpenInfo(v => v === t.label ? null : t.label)} aria-label="説明"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                  </button>
                )}
              </div>
              {openInfo === t.label && desc && (
                <>
                  <div onClick={() => setOpenInfo(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                  <div style={{ position: 'relative', zIndex: 21, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 10, boxShadow: '0 6px 24px rgba(14,14,20,.12)', padding: '11px 13px', margin: '0 0 8px 27px' }}>
                    <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{desc}</p>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
