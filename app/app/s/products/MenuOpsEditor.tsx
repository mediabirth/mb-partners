'use client'
/**
 * メニュー内部運用エディタ（完全等価化A）— MBサービスマスタのメニュー編集と同一機能・同一文法。
 * 報酬（複数・型/値/トリガー/期間）＋協力タスク（6マスタ）＋ヒアリング項目。すべて即時反映（保存で一括）＋監査＋運営通知。
 * 型はレートカードで制約（標準=固定/受注額%のみ・サーバvalidateが正）。削除=無効化（過去案件の記録保全）。
 */
import { useEffect, useState } from 'react'

const COOP_TASK_MASTER = ['つなぐ', 'アポイント', 'ヒヤリング', 'アシスト/フォロー', '価格/条件合意', 'クロージング']
const LINE = '0.5px solid var(--line)'
const inputStyle: React.CSSProperties = { border: LINE, borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.8rem', background: '#fff', boxSizing: 'border-box' }
type RewardDraft = { id?: string; reward_type: 'fixed' | 'rate' | 'continuous'; reward_value: string; reward_trigger: string; reward_months: string; tasks: string[] }
type HearingDraft = { id?: string; label: string; input_type: 'text' | 'number' | 'select'; options: string; required: boolean }

export default function MenuOpsEditor({ menuId, onSaved }: { menuId: string; onSaved?: () => void }) {
  const [passthrough, setPassthrough] = useState(true)
  const [rewards, setRewards] = useState<RewardDraft[] | null>(null)
  const [hearing, setHearing] = useState<HearingDraft[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => {
    setRewards(null); setHearing(null); setNote('')
    fetch(`/api/supplier/menu-ops?menu_id=${menuId}`).then(r => r.ok ? r.json() : null).then(d => {
      setPassthrough(d?.passthrough !== false)
      setRewards(((d?.rewards ?? []) as { id: string; reward_type: RewardDraft['reward_type']; reward_value: number; reward_trigger: string | null; default_months: number | null; tasks: string[] }[]).map(r => ({ id: r.id, reward_type: r.reward_type, reward_value: String(r.reward_value ?? ''), reward_trigger: r.reward_trigger ?? '', reward_months: r.default_months != null ? String(r.default_months) : '', tasks: r.tasks ?? [] })))
      setHearing(((d?.hearing ?? []) as { id: string; label: string; input_type: HearingDraft['input_type']; options: string[] | null; required: boolean }[]).map(h => ({ id: h.id, label: h.label, input_type: h.input_type, options: Array.isArray(h.options) ? h.options.join('、') : '', required: h.required })))
    }).catch(() => { setRewards([]); setHearing([]) })
  }, [menuId])
  const setR = (i: number, patch: Partial<RewardDraft>) => setRewards(p => p!.map((r, j) => j === i ? { ...r, ...patch } : r))
  const setH = (i: number, patch: Partial<HearingDraft>) => setHearing(p => p!.map((h, j) => j === i ? { ...h, ...patch } : h))

  async function save() {
    if (!rewards || !hearing || busy) return
    setBusy(true); setNote('')
    const r1 = await fetch('/api/supplier/menu-ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'rewards_set', menu_id: menuId, rewards: rewards.map(r => ({ id: r.id, reward_type: r.reward_type, reward_value: Number(r.reward_value), reward_trigger: r.reward_trigger, reward_months: r.reward_months ? Number(r.reward_months) : null, tasks: r.tasks })) }) })
    const j1 = await r1.json().catch(() => ({}))
    if (!r1.ok) { setNote(j1.error ?? '報酬の保存に失敗しました'); setBusy(false); return }
    const r2 = await fetch('/api/supplier/menu-ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'hearing_set', menu_id: menuId, items: hearing.map((h, i) => ({ id: h.id, label: h.label, input_type: h.input_type, options: h.input_type === 'select' ? h.options.split(/[、,]/).map(s => s.trim()).filter(Boolean) : null, required: h.required, sort: i })) }) })
    const j2 = await r2.json().catch(() => ({}))
    setNote(r2.ok ? (j1.warning ? `保存しました ／ ⚠ ${j1.warning}` : '保存しました（すぐに反映されます）') : (j2.error ?? 'ヒアリング項目の保存に失敗しました'))
    setBusy(false)
    if (r1.ok && r2.ok) onSaved?.()
  }

  if (rewards === null || hearing === null) return <div className="ui-skeleton" style={{ height: 90, borderRadius: 10, marginTop: 8 }} />
  const TYPES: ['fixed' | 'rate' | 'continuous', string][] = passthrough
    ? [['fixed', '固定（円）'], ['rate', '受注額（%）']]
    : [['fixed', '固定（円）'], ['rate', '粗利（%）'], ['continuous', '継続（毎月）']]
  return (
    <div>
      {/* 報酬ブロック（MBと同一文法: 0.5px罫線区切り・型ピル・値+単位・トリガー・協力タスク） */}
      {rewards.map((r, ri) => (
        <div key={r.id ?? `nr-${ri}`} style={{ borderTop: ri === 0 ? 'none' : LINE, marginTop: ri === 0 ? 0 : 14, paddingTop: ri === 0 ? 0 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>報酬{ri + 1}</span>
            <button type="button" onClick={() => setRewards(p => p!.filter((_, j) => j !== ri))} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500 }}>削除</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPES.map(([v, l]) => (
              <button type="button" key={v} onClick={() => setR(ri, { reward_type: v })}
                style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500, border: `1.5px solid ${r.reward_type === v ? 'var(--c-blue)' : 'var(--line)'}`, background: r.reward_type === v ? 'var(--blue-bg2)' : '#fff', color: r.reward_type === v ? 'var(--c-blue)' : 'var(--muted2)' }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <input value={r.reward_value} onChange={e => setR(ri, { reward_value: e.target.value })} inputMode="numeric" placeholder={r.reward_type === 'fixed' ? '30000' : '5'}
              style={{ ...inputStyle, flex: 1, fontFamily: 'Inter', textAlign: 'right' }} />
            <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500, flexShrink: 0 }}>{r.reward_type === 'fixed' ? '円' : passthrough ? '%（受注額）' : r.reward_type === 'rate' ? '%（粗利）' : '%（毎月の粗利）'}</span>
          </div>
          {r.reward_type === 'continuous' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', flexShrink: 0 }}>期間（デフォルト）</label>
              <input value={r.reward_months} onChange={e => setR(ri, { reward_months: e.target.value })} inputMode="numeric" placeholder="12" style={{ ...inputStyle, width: 80, fontFamily: 'Inter', textAlign: 'right' }} />
              <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500 }}>ヶ月</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>トリガー（成果地点）</label>
            <input value={r.reward_trigger} onChange={e => setR(ri, { reward_trigger: e.target.value })} placeholder="例：契約成立で確定" style={{ ...inputStyle, fontSize: '.76rem' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>協力タスク（パートナーの役割分担）</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {COOP_TASK_MASTER.map(label => {
                const on = r.tasks.includes(label)
                return (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', cursor: 'pointer', padding: '4px 0' }}>
                    <input type="checkbox" checked={on} onChange={() => setR(ri, { tasks: on ? r.tasks.filter(t => t !== label) : [...r.tasks, label] })} style={{ accentColor: 'var(--c-blue)', width: 14, height: 14 }} />
                    <span style={{ fontWeight: 500, color: on ? 'var(--txt)' : 'var(--muted2)' }}>{label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      ))}
      <div style={{ borderTop: rewards.length ? LINE : 'none', marginTop: rewards.length ? 14 : 0, paddingTop: rewards.length ? 12 : 0 }}>
        <button type="button" onClick={() => setRewards(p => [...(p ?? []), { reward_type: 'fixed', reward_value: '', reward_trigger: '', reward_months: '', tasks: [] }])}
          style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>＋ 報酬を追加</button>
      </div>

      {/* ヒアリング項目（MBサービスマスタと同一の定義UI） */}
      <div style={{ borderTop: LINE, marginTop: 14, paddingTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', marginBottom: 8 }}>ヒアリング項目（このメニューの案件で確認すること）</div>
        {hearing.map((h, i) => (
          <div key={h.id ?? `nh-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <input value={h.label} onChange={e => setH(i, { label: e.target.value })} placeholder="例：年収" style={{ ...inputStyle, flex: 1, minWidth: 110, fontSize: '.76rem' }} />
            <select value={h.input_type} onChange={e => setH(i, { input_type: e.target.value as HearingDraft['input_type'] })} style={{ ...inputStyle, width: 92, fontSize: '.74rem' }}>
              <option value="text">テキスト</option><option value="number">数値</option><option value="select">選択肢</option>
            </select>
            {h.input_type === 'select' && <input value={h.options} onChange={e => setH(i, { options: e.target.value })} placeholder="選択肢（、区切り）" style={{ ...inputStyle, flex: 1, minWidth: 120, fontSize: '.74rem' }} />}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.66rem', color: 'var(--muted2)', cursor: 'pointer', flexShrink: 0 }}>
              <input type="checkbox" checked={h.required} onChange={e => setH(i, { required: e.target.checked })} style={{ accentColor: 'var(--c-blue)', width: 13, height: 13 }} />必須
            </label>
            <button type="button" title="この項目を外す" onClick={() => setHearing(p => p!.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.78rem', flexShrink: 0, padding: 2 }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setHearing(p => [...(p ?? []), { label: '', input_type: 'text', options: '', required: false }])}
          style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>＋ 項目を追加</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button type="button" onClick={save} disabled={busy} className="ui-btn ui-btn--secondary" style={{ fontSize: '.7rem', padding: '8px 16px' }}>{busy ? '保存中…' : 'この定義を保存する（すぐ反映）'}</button>
        {note && <span style={{ fontSize: '.64rem', color: /失敗|エラー/.test(note) ? 'var(--red)' : 'var(--muted2)' }}>{note}</span>}
      </div>
    </div>
  )
}
