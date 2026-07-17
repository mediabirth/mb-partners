'use client'
/**
 * 個別条件（B・2026-07-18）— 特定のパートナーだけ報酬を変える（自社の紹介者×自社メニューのみ）。
 * 機構はMBコンソールの個別条件と同一（partner_reward_overrides・値のみ・確定済みはsnapshot凍結で不変）。
 */
import { useEffect, useState } from 'react'
import { rewardValueText } from '@/lib/reward-format'

type Ov = { id: string; partner_id: string; reward_id: string | null; override_value: number; note: string | null; active: boolean }
type Pt = { id: string; code: string; name: string }
type Rw = { id: string; menu_name: string; service_name: string; reward_type: string; reward_value: number; reward_base: string | null }
const inputStyle: React.CSSProperties = { border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff', boxSizing: 'border-box' }

export default function OverridesSection() {
  const [data, setData] = useState<{ overrides: Ov[]; partners: Pt[]; rewards: Rw[] } | null>(null)
  const [open, setOpen] = useState(false)
  const [pid, setPid] = useState(''); const [rid, setRid] = useState(''); const [val, setVal] = useState(''); const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const load = () => fetch('/api/supplier/reward-overrides').then(r => r.ok ? r.json() : null).then(d => setData(d ?? { overrides: [], partners: [], rewards: [] })).catch(() => setData({ overrides: [], partners: [], rewards: [] }))
  useEffect(() => { load() }, [])
  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 6000) }
  if (!data) return null
  const nameOf = (id: string) => data.partners.find(p => p.id === id)
  const rewardOf = (id: string | null) => data.rewards.find(r => r.id === id)

  async function add() {
    if (!pid || !rid || !val || busy) return
    setBusy(true)
    const r = await fetch('/api/supplier/reward-overrides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partner_id: pid, reward_id: rid, override_value: Number(val), note }) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? (j.warning ? `設定しました ／ ⚠ ${j.warning}` : '設定しました（このパートナーのアプリにだけ個別の条件で表示されます）') : (j.error ?? '失敗しました'))
    if (r.ok) { setPid(''); setRid(''); setVal(''); setNote(''); setOpen(false); await load() }
    setBusy(false)
  }
  async function toggle(ov: Ov) {
    setBusy(true)
    const r = await fetch('/api/supplier/reward-overrides', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ov.id, active: !ov.active }) })
    if (!r.ok) { const j = await r.json().catch(() => ({})); say(j.error ?? '失敗しました') }
    await load(); setBusy(false)
  }

  return (
    <div style={{ background: 'var(--s-0, #fff)', border: '0.5px solid var(--line)', borderRadius: 14, marginTop: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 15px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 500 }}>個別条件（特定のパートナーだけ報酬を変える）</div>
          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>そのパートナーのアプリにだけ表示されます。確定済みの案件には影響しません。</div>
        </div>
        {data.partners.length > 0 && data.rewards.length > 0 && (
          <button onClick={() => setOpen(o => !o)} className="ui-btn ui-btn--ghost" style={{ fontSize: '.68rem', padding: '7px 13px', flexShrink: 0 }}>{open ? '閉じる' : '＋ 設定する'}</button>
        )}
      </div>
      {open && (
        <div style={{ padding: '0 15px 13px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={pid} onChange={e => setPid(e.target.value)} style={{ ...inputStyle, minWidth: 150 }}>
            <option value="">パートナーを選択…</option>
            {data.partners.map(p => <option key={p.id} value={p.id}>{p.name}（{p.code}）</option>)}
          </select>
          <select value={rid} onChange={e => setRid(e.target.value)} style={{ ...inputStyle, minWidth: 190 }}>
            <option value="">メニューの報酬を選択…</option>
            {data.rewards.map(r => <option key={r.id} value={r.id}>{r.service_name} ─ {r.menu_name}（通常 {rewardValueText({ reward_type: r.reward_type as never, reward_value: r.reward_value, reward_base: r.reward_base })}）</option>)}
          </select>
          <input value={val} onChange={e => setVal(e.target.value)} inputMode="numeric" placeholder={rewardOf(rid)?.reward_type === 'fixed' ? '例：40000' : '例：7'} style={{ ...inputStyle, width: 110, fontFamily: 'Inter', textAlign: 'right' }} />
          <span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{rewardOf(rid)?.reward_type === 'fixed' ? '円' : '%'}</span>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="メモ（任意）" style={{ ...inputStyle, flex: 1, minWidth: 130 }} />
          <button onClick={add} disabled={busy || !pid || !rid || !val} className="ui-btn ui-btn--primary" style={{ fontSize: '.7rem', padding: '8px 15px' }}>設定する</button>
        </div>
      )}
      {data.overrides.length > 0 && (
        <div style={{ borderTop: '0.5px solid var(--line)' }}>
          {data.overrides.map(ov => {
            const pt = nameOf(ov.partner_id); const rw = rewardOf(ov.reward_id)
            return (
              <div key={ov.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 15px', borderTop: '0.5px solid var(--line)', fontSize: '.72rem', opacity: ov.active ? 1 : .5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                  {pt?.name ?? '（運営設定の対象）'}{pt && <span className="tnum" style={{ fontSize: '.56rem', color: 'var(--muted2)', fontFamily: 'Inter', marginLeft: 6 }}>{pt.code}</span>}
                  <span style={{ color: 'var(--muted2)', fontWeight: 400, fontSize: '.64rem' }}> ・ {rw ? `${rw.service_name} ─ ${rw.menu_name}` : '全メニュー'}</span>
                </span>
                <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, flexShrink: 0 }}>{rw?.reward_type === 'fixed' ? `¥${ov.override_value.toLocaleString()}` : `${ov.override_value}%`}</span>
                {!ov.active && <span style={{ fontSize: '.56rem', color: 'var(--muted2)', flexShrink: 0 }}>停止中</span>}
                <button onClick={() => toggle(ov)} disabled={busy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500, color: ov.active ? 'var(--muted2)' : 'var(--c-blue)', flexShrink: 0 }}>{ov.active ? '止める' : '再開'}</button>
              </div>
            )
          })}
        </div>
      )}
      {msg && <p style={{ fontSize: '.64rem', color: /失敗|できません|ありません/.test(msg) ? 'var(--red)' : 'var(--muted2)', margin: 0, padding: '0 15px 12px' }}>{msg}</p>}
    </div>
  )
}
