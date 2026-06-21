'use client'
/**
 * Wave2-②C：console 再活性化パネル（ops操作・additive）。
 * 休眠partnerに手動でナッジを1人ずつ送る（自動連投なし）。頻度上限(直近N日)内はボタン無効＋理由表示。
 * 送信は /api/console/reactivate/nudge → notify() で inbox+LINE+push へ fan-out。お金は出さない/触らない。
 */
import { useState } from 'react'

export type DormantRow = {
  id: string
  name: string
  lastReferral: string
  dormantDays: number
  referrals: number
  lastNudgedAt: string | null
  line: boolean
  push: boolean
}

function fmt(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : `${d.getMonth() + 1}/${d.getDate()}`
}

export default function ReactivatePanel({ rows, cooldownDays }: { rows: DormantRow[]; cooldownDays: number }) {
  const [state, setState] = useState<Record<string, 'idle' | 'busy' | 'sent' | 'cooldown'>>({})
  const [toast, setToast] = useState('')

  const cooldownLeft = (lastNudgedAt: string | null): number => {
    if (!lastNudgedAt) return 0
    const elapsed = Date.now() - new Date(lastNudgedAt).getTime()
    const left = cooldownDays * 86_400_000 - elapsed
    return left > 0 ? Math.ceil(left / 86_400_000) : 0
  }

  async function nudge(r: DormantRow) {
    setState(s => ({ ...s, [r.id]: 'busy' }))
    try {
      const res = await fetch('/api/console/reactivate/nudge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId: r.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setState(s => ({ ...s, [r.id]: 'sent' })); setToast(`${r.name}さんにナッジを送信しました`) }
      else if (data.cooldown) { setState(s => ({ ...s, [r.id]: 'cooldown' })); setToast(data.error ?? '再送できません') }
      else { setState(s => ({ ...s, [r.id]: 'idle' })); setToast(data.error ?? '送信に失敗しました') }
    } catch { setState(s => ({ ...s, [r.id]: 'idle' })); setToast('送信に失敗しました') }
  }

  if (rows.length === 0) {
    return (
      <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '28px 20px', textAlign: 'center', fontSize: '.72rem', color: 'var(--muted2)' }}>
        休眠中のパートナーはいません。<br />（過去に紹介実績があり、直近で新規紹介が止まっている方がここに表示されます）
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => {
        const left = cooldownLeft(r.lastNudgedAt)
        const st = state[r.id] ?? (left > 0 ? 'cooldown' : 'idle')
        const disabled = st === 'busy' || st === 'sent' || (st === 'cooldown' && left > 0)
        return (
          <div key={r.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: '.84rem' }}>{r.name}</b>
                <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--amber)', background: 'var(--amber-bg)', borderRadius: 999, padding: '2px 9px' }}>{r.dormantDays}日 休眠</span>
              </div>
              <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 4 }}>
                最終紹介 {fmt(r.lastReferral)}・紹介{r.referrals}件・最終ナッジ {fmt(r.lastNudgedAt)}
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: r.line ? '#06824a' : 'var(--muted)', background: r.line ? '#E7F6EF' : 'var(--bg2)', borderRadius: 6, padding: '2px 7px' }}>LINE {r.line ? '✓' : '—'}</span>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: r.push ? 'var(--blue)' : 'var(--muted)', background: r.push ? 'var(--blue-bg)' : 'var(--bg2)', borderRadius: 6, padding: '2px 7px' }}>Push {r.push ? '✓' : '—'}</span>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 6, padding: '2px 7px' }}>受信箱 ✓</span>
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <button onClick={() => nudge(r)} disabled={disabled} className="btn btn-p lift" style={{ minHeight: 40, padding: '0 16px', fontSize: '.74rem', opacity: disabled ? .55 : 1 }}>
                {st === 'busy' ? '送信中…' : st === 'sent' ? '送信済み' : 'ナッジを送る'}
              </button>
              {st !== 'sent' && left > 0 && <div style={{ fontSize: '.54rem', color: 'var(--muted)', marginTop: 5 }}>あと{left}日で再送可</div>}
            </div>
          </div>
        )
      })}
      {toast && <p style={{ fontSize: '.64rem', color: 'var(--muted2)', textAlign: 'center', marginTop: 4 }}>{toast}</p>}
    </div>
  )
}
