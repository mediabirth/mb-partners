'use client'
/**
 * サービス設定（サプライヤー自己設定・B）。あなたの会社セクション内。
 * 即時反映＝報酬額・社内向けメモ（監査＋運営通知）／申請制＝顧客向け説明・イメージ画像・メニュー名・公開/非公開。
 * データ・境界は /api/supplier/self（セッションスコープ強制）。v2.2静音＝箱は最小・保存/申請の動詞ボタン。
 */
import { useEffect, useState } from 'react'

type Brand = { id: string; name: string; active: boolean; supplier_memo: string | null; image_url: string | null }
type Menu = { id: string; name: string; service_id: string; public_description: string | null }
type Reward = { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }
type Req = { id: string; kind: string; menu_id: string | null; service_id: string; payload: { value?: unknown }; status: string; reason: string | null }
const KIND_JP: Record<string, string> = { public_description: '顧客向け説明', image: 'イメージ画像', menu_name: 'メニュー名', visibility: '公開/非公開' }
const LINE = '1px solid var(--line)'

export default function SupplierSettings() {
  const [data, setData] = useState<{ brands: Brand[]; menus: Menu[]; rewards: Reward[]; requests: Req[] } | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  useEffect(() => { load() }, [])
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }
  const d = (k: string, fallback: string) => draft[k] ?? fallback

  async function patch(body: Record<string, unknown>, okMsg: string) {
    if (busy) return
    setBusy(true)
    const r = await fetch('/api/supplier/self', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? (j.warning ? `${okMsg} ／ ⚠ ${j.warning}` : okMsg) : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy(false)
  }
  async function request(body: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    const r = await fetch('/api/supplier/self', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? '申請しました（運営の確認後に反映されます）' : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy(false)
  }

  if (!data || data.brands.length === 0) return null
  const pending = data.requests.filter(r => r.status === 'pending')

  const FLD: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: LINE, fontSize: '.74rem', fontFamily: 'inherit' }
  const BTN: React.CSSProperties = { fontSize: '.62rem', fontWeight: 500, color: 'var(--c-blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }
  const LBL: React.CSSProperties = { fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: '14px 20px 0' }}>
      <div style={{ background: '#fff', border: LINE, borderRadius: 13, overflow: 'hidden' }}>
        <button onClick={() => setOpen(v => !v)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--txt)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 500 }}>サービス設定</span>
          {pending.length > 0 && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--c-blue)', background: 'var(--blue-bg2)', borderRadius: 999, padding: '2px 9px' }}>申請中 {pending.length}</span>}
          <span style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </button>
        {open && (
          <div style={{ borderTop: LINE, padding: '4px 16px 16px' }}>
            <p style={{ fontSize: '.6rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '10px 0 4px' }}>
              報酬額と社内メモは<b>すぐに反映</b>されます（変更はMBにも通知）。顧客向け説明・画像・メニュー名・公開状態は<b>申請制</b>で、MBの確認後に反映されます。
            </p>
            {data.brands.map(br => (
              <div key={br.id} style={{ marginTop: 14 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 700, marginBottom: 8 }}>{br.name}
                  <span style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--muted2)', marginLeft: 8 }}>{br.active ? '公開中' : '非公開'}</span>
                  <button disabled={busy} onClick={() => request({ kind: 'visibility', service_id: br.id, value: !br.active })} style={{ ...BTN, marginLeft: 8 }}>{br.active ? '非公開を申請' : '公開を申請'}</button>
                </div>
                <label style={LBL}>社内向けメモ（即時・お客さまには表示されません）</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <textarea rows={2} value={d('memo:' + br.id, br.supplier_memo ?? '')} onChange={e => setDraft(p => ({ ...p, ['memo:' + br.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical' }} />
                  <button disabled={busy} onClick={() => patch({ service_id: br.id, supplier_memo: d('memo:' + br.id, br.supplier_memo ?? '') }, 'メモを保存しました')} style={BTN}>保存</button>
                </div>
                <label style={LBL}>イメージ画像URL（申請制）</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input value={d('img:' + br.id, br.image_url ?? '')} onChange={e => setDraft(p => ({ ...p, ['img:' + br.id]: e.target.value }))} placeholder="https://…" style={FLD} />
                  <button disabled={busy} onClick={() => request({ kind: 'image', service_id: br.id, value: d('img:' + br.id, br.image_url ?? '') })} style={BTN}>申請</button>
                </div>
                {data.menus.filter(m => m.service_id === br.id).map(m => (
                  <div key={m.id} style={{ borderTop: '0.5px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
                    <label style={LBL}>メニュー名（申請制）</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input value={d('mn:' + m.id, m.name)} onChange={e => setDraft(p => ({ ...p, ['mn:' + m.id]: e.target.value }))} style={FLD} />
                      <button disabled={busy} onClick={() => request({ kind: 'menu_name', service_id: br.id, menu_id: m.id, value: d('mn:' + m.id, m.name) })} style={BTN}>申請</button>
                    </div>
                    {data.rewards.filter(r => r.menu_id === m.id).map(r => (
                      <div key={r.id} style={{ marginBottom: 8 }}>
                        <label style={LBL}>紹介報酬（即時）: {r.reward_type === 'fixed' ? '固定（円）' : r.reward_base === '売上' ? '受注額（%）' : '率（%）'}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input inputMode="numeric" value={d('rv:' + r.id, String(r.reward_value))} onChange={e => setDraft(p => ({ ...p, ['rv:' + r.id]: e.target.value }))} style={{ ...FLD, fontFamily: 'Inter', textAlign: 'right', maxWidth: 140 }} />
                          <button disabled={busy} onClick={() => patch({ reward_id: r.id, reward_value: Number(d('rv:' + r.id, String(r.reward_value))) }, '報酬を更新しました')} style={BTN}>保存</button>
                        </div>
                      </div>
                    ))}
                    <label style={LBL}>顧客向け説明（申請制）</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea rows={2} value={d('pd:' + m.id, m.public_description ?? '')} onChange={e => setDraft(p => ({ ...p, ['pd:' + m.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical' }} />
                      <button disabled={busy} onClick={() => request({ kind: 'public_description', service_id: br.id, menu_id: m.id, value: d('pd:' + m.id, m.public_description ?? '') })} style={BTN}>申請</button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {data.requests.length > 0 && (
              <div style={{ borderTop: LINE, marginTop: 14, paddingTop: 10 }}>
                <div style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>申請の履歴</div>
                {data.requests.slice(0, 6).map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.66rem', padding: '4px 0' }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{KIND_JP[r.kind] ?? r.kind}{typeof r.payload?.value === 'string' ? ` ・ ${String(r.payload.value).slice(0, 30)}` : ''}</span>
                    <span style={{ flexShrink: 0, fontWeight: 500, color: r.status === 'pending' ? 'var(--c-blue)' : r.status === 'approved' ? 'var(--green)' : 'var(--muted2)' }}>
                      {r.status === 'pending' ? '確認待ち' : r.status === 'approved' ? '反映済み' : `見送り${r.reason ? `（${r.reason}）` : ''}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {toast && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>{toast}</p>}
    </div>
  )
}
