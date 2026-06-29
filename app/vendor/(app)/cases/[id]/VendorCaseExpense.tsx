'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
// A: 経費申請モーダルは開いた時だけ読み込む（初回バンドルから除外）。
const VendorExpenseSheet = dynamic(() => import('@/components/VendorExpenseSheet'), { ssr: false })

type Expense = { id: string; assignment_id: string; kind: string; amount: number; status: string; has_evidence: boolean }
const EXP_ST: Record<string, { label: string; c: string; bg: string }> = {
  submitted: { label: '申請中', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  approved: { label: '承認済', c: 'var(--green)', bg: 'var(--green-bg)' },
  rejected: { label: '却下', c: 'var(--red)', bg: 'var(--red-bg)' },
}

// 案件詳細の経費ブロック：申請は共通シート（対象案件プリセット・カメラ/ファイル独立）、下に履歴。
export default function VendorCaseExpense({ assignmentId, label, initial }: { assignmentId: string; label: string; initial: Expense[] }) {
  const [open, setOpen] = useState(false)
  const approved = initial.filter(e => e.status === 'approved').reduce((s, e) => s + e.amount, 0)

  return (
    <div style={{ padding: '8px 20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '16px 0 8px' }}>
        <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)' }}>経費</h2>
        <span style={{ fontSize: '.62rem', color: 'var(--muted)' }}>承認済 ¥{approved.toLocaleString()}</span>
      </div>

      <button onClick={() => setOpen(true)} className="btn btn-p" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>＋ 経費を申請</button>

      <div style={{ marginTop: 14 }}>
        {initial.length === 0 ? (
          <p style={{ fontSize: '.68rem', color: 'var(--muted2)', padding: '6px 2px' }}>この案件の経費申請はまだありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
            {initial.map((e, i) => {
              const st = EXP_ST[e.status] ?? { label: e.status, c: 'var(--muted2)', bg: 'var(--bg2)' }
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: i < initial.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
                  <Thumb id={e.id} hasEvidence={e.has_evidence} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 700 }}>{e.kind}</div>
                    <div style={{ marginTop: 4 }}><span style={{ fontSize: '.54rem', fontWeight: 700, color: st.c, background: st.bg, borderRadius: 20, padding: '2px 8px' }}>{st.label}</span></div>
                  </div>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.84rem', fontWeight: 800 }}>¥{e.amount.toLocaleString()}</span>
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
  const box: React.CSSProperties = { width: 44, height: 44, borderRadius: 10, flexShrink: 0, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)' }
  if (!hasEvidence) return <div style={{ ...box, color: 'var(--muted)', fontSize: '.9rem' }}>—</div>
  if (state === 'idle' || state === 'loading') return <div style={box} />
  if (state === 'img' && url) return (
    <button onClick={() => window.open(url, '_blank', 'noopener')} style={{ ...box, padding: 0, cursor: 'zoom-in' }} title="領収書を拡大">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="領収書" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setState('doc')} />
    </button>
  )
  return <button onClick={() => url && window.open(url, '_blank', 'noopener')} style={{ ...box, cursor: 'pointer', color: 'var(--blue)', fontSize: '1.1rem' }} title="領収書を開く">📄</button>
}
