'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { VENDOR_EXPENSE_ST } from '@/lib/vendor-status'
// A: 経費申請モーダルは開いた時だけ読み込む（初回バンドルから除外）。
const VendorExpenseSheet = dynamic(() => import('@/components/VendorExpenseSheet'), { ssr: false })

type Expense = { id: string; assignment_id: string; kind: string; amount: number; status: string; has_evidence: boolean }

// 案件詳細の経費ブロック：申請は共通シート（対象案件プリセット・カメラ/ファイル独立）、下に履歴。
export default function VendorCaseExpense({ assignmentId, label, initial }: { assignmentId: string; label: string; initial: Expense[] }) {
  const [open, setOpen] = useState(false)
  const approved = initial.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ padding: '8px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '16px 0 8px' }}>
        <h2 style={{ fontSize: '.78rem', fontWeight: 500, color: 'var(--muted2)' }}>経費</h2>
        <span style={{ fontSize: '.62rem', color: 'var(--muted)' }}>承認済 ¥{approved.toLocaleString()}</span>
      </div>

      <button onClick={() => setOpen(true)} className="ui-btn ui-btn--primary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>＋ 経費を申請</button>

      <div style={{ marginTop: 14 }}>
        {initial.length === 0 ? (
          <p style={{ fontSize: '.68rem', color: 'var(--muted2)', padding: '6px 2px' }}>この案件の経費申請はまだありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {initial.map((e, i) => {
              const st = VENDOR_EXPENSE_ST[e.status] ?? { label: e.status, c: 'var(--muted2)', bg: 'var(--bg2)' }
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < initial.length - 1 ? '0.5px solid var(--line)' : 'none' }}>
                  <Thumb id={e.id} hasEvidence={e.has_evidence} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 500 }}>{e.kind}</div>
                    {/* 状態＝6pxドット+テキスト（塗りピル廃止・ベンダー語単一ソース） */}
                    <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, display: 'inline-block' }} />
                      <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>{st.label}</span>
                    </div>
                  </div>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 500 }}>¥{e.amount.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <VendorExpenseSheet open={open} onClose={() => setOpen(false)} presetAssignmentId={assignmentId} presetLabel={label} />
    </div>
  )
}

function Thumb({ id, hasEvidence }: { id: string; hasEvidence: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'img' | 'doc'>('idle')
  useEffect(() => {
    if (!hasEvidence) return
    let alive = true; setState('loading')
    fetch(`/api/vendor/expenses/${id}/evidence`).then(r => r.json()).then(d => { if (!alive) return; if (d.url) { setUrl(d.url); setState('img') } else setState('doc') }).catch(() => { if (alive) setState('doc') })
    return () => { alive = false }
  }, [id, hasEvidence])
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 10, flexShrink: 0, border: '0.5px solid var(--line)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }
  if (!hasEvidence) return <div style={{ ...box, color: 'var(--muted)', fontSize: '.9rem' }}>—</div>
  if (state === 'idle' || state === 'loading') return <div style={box} />
  if (state === 'img' && url) return (
    <button onClick={() => window.open(url, '_blank', 'noopener')} style={{ ...box, padding: 0, cursor: 'zoom-in' }} title="領収書を拡大">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="領収書" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setState('doc')} />
    </button>
  )
  return (
    <button onClick={() => url && window.open(url, '_blank', 'noopener')} style={{ ...box, cursor: 'pointer', color: 'var(--blue)' }} title="領収書を開く">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  )
}
