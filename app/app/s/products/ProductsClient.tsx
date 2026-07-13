'use client'
/**
 * 商品 v5（MBコンソール サービスマスタと同体裁）:
 * 一覧＝1行1ブランド（丸ロゴ・名前・公開状態・›）→行クリックでドロワー（左ナビ=基本情報＋メニュー列／中央=編集）。
 * 即時＝紹介報酬・社内メモ／申請＝メニュー名・顧客向け説明・画像・公開状態（琥珀バッジ）。
 * データ・境界・ガードは /api/supplier/self（セッションスコープ）。
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ServiceAvatar from '@/components/ServiceAvatar'

type Brand = { id: string; name: string; active: boolean; supplier_memo: string | null; image_url: string | null; logo_path: string | null; icon: string | null; color: string | null; category: string | null }
type Menu = { id: string; name: string; service_id: string; public_description: string | null }
type Reward = { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }
type Req = { id: string; kind: string; menu_id: string | null; service_id: string; payload: { value?: unknown }; status: string; reason: string | null }
const LINE = '0.5px solid var(--line)'

export default function ProductsClient() {
  const [data, setData] = useState<{ brands: Brand[]; menus: Menu[]; rewards: Reward[]; requests: Req[] } | null>(null)
  const [editing, setEditing] = useState<string>('')          // brand id（ドロワー）
  const [navSel, setNavSel] = useState<string>('basic')       // 'basic' | menu id
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(setData).catch(() => {})
  useEffect(() => { load() }, [])
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000) }
  const d = (k: string, fb: string) => draft[k] ?? fb
  const brand = useMemo(() => data?.brands.find(b => b.id === editing) ?? null, [data, editing])
  const brandMenus = useMemo(() => (data?.menus ?? []).filter(m => m.service_id === editing), [data, editing])
  const selMenu = useMemo(() => brandMenus.find(m => m.id === navSel) ?? null, [brandMenus, navSel])
  const pendingOf = (kind: string, menuId?: string | null, serviceId?: string) =>
    (data?.requests ?? []).find(r => r.status === 'pending' && r.kind === kind && (menuId ? r.menu_id === menuId : r.service_id === serviceId && !r.menu_id))
  const brandPending = (id: string) => (data?.requests ?? []).filter(r => r.status === 'pending' && r.service_id === id).length

  async function call(method: 'PATCH' | 'POST', body: Record<string, unknown>, okMsg: string) {
    if (busy) return false
    setBusy(true)
    const r = await fetch('/api/supplier/self', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    say(r.ok ? (j.warning ? `${okMsg} ／ ⚠ ${j.warning}` : okMsg) : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy(false)
    return r.ok
  }
  async function saveRewards() {
    const targets = (data?.rewards ?? []).filter(r => r.menu_id === navSel && draft['rv:' + r.id] != null && Number(draft['rv:' + r.id]) !== Number(r.reward_value))
    if (!targets.length) { say('変更はありません'); return }
    for (const r of targets) {
      const ok = await call('PATCH', { reward_id: r.id, reward_value: Number(draft['rv:' + r.id]) }, '紹介報酬を保存しました（すぐに反映）')
      if (!ok) return
    }
  }

  if (!data) return <div className="ui-skeleton" style={{ height: 120, borderRadius: 13 }} />
  if (!data.brands.length) return <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>ブランドがまだありません。搭載についてはMB Partnersへご相談ください。</p>

  const AMBER = (label = '申請中') => <span style={{ fontSize: '.54rem', fontWeight: 700, color: '#8a6100', background: 'rgba(224,168,0,.14)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{label}</span>
  const FLD: React.CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 8, border: LINE, fontSize: '.82rem', fontFamily: 'inherit', color: 'var(--txt)', background: '#fff', boxSizing: 'border-box' }
  const BTN: React.CSSProperties = { fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 500, minHeight: 38, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', color: 'var(--c-blue)', background: 'var(--blue-bg2)', flexShrink: 0 }
  const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.03em', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }

  return (
    <div>
      {/* 一覧（サービスマスタと同じ1行文法） */}
      <div style={{ background: 'var(--s-0, #fff)', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
        {data.brands.map((br, i) => (
          <button key={br.id} onClick={() => { setEditing(br.id); setNavSel('basic') }}
            style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : LINE, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ServiceAvatar logoPath={br.logo_path} icon={br.icon ?? 'arrows'} color={br.color ?? '#4733e6'} name={br.name} size={28} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--txt)' }}>{br.name}</span>
              {br.category && <span style={{ fontSize: 11, color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{br.category}</span>}
              {brandPending(br.id) > 0 && AMBER(`申請中 ${brandPending(br.id)}`)}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', boxSizing: 'border-box', background: br.active ? 'var(--c-blue)' : 'transparent', border: br.active ? 'none' : '1px solid var(--muted)' }} />
              <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{br.active ? '公開' : '停止'}</span>
            </span>
            <span style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6" /></svg>
            </span>
          </button>
        ))}
      </div>

      {/* ドロワー（サービスマスタと同じ右ドロワー・左ナビ=基本情報＋メニュー列）。
          ★createPortalでbody直下へ＝.page-animのanimation(transform)がfixedの包含ブロック化して見切れる既知事故の恒久回避（CLAUDE.mdモーダル規律） */}
      {brand && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setEditing('')} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', backdropFilter: 'blur(2px)', zIndex: 40 }} />
          <div className="exp-in prod-drawer" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 760, maxWidth: '96vw', background: 'var(--bg2)', zIndex: 45, boxShadow: '-12px 0 40px rgba(14,14,20,.18)', display: 'flex', overflow: 'hidden' }}>
            {/* 左ナビ */}
            <div className="prod-lnav" style={{ width: 132, flexShrink: 0, background: '#fff', borderRight: LINE, overflowY: 'auto', padding: '14px 8px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 500, padding: '0 8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</div>
              <button onClick={() => setNavSel('basic')} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 8, minHeight: 38, padding: '0 10px', fontSize: '.72rem', fontWeight: navSel === 'basic' ? 700 : 400, background: navSel === 'basic' ? 'var(--blue-bg2)' : 'none', color: navSel === 'basic' ? 'var(--c-blue)' : 'var(--txt)' }}>基本情報</button>
              <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', padding: '12px 10px 4px' }}>メニュー</div>
              {brandMenus.map(m => (
                <button key={m.id} onClick={() => setNavSel(m.id)} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 8, minHeight: 38, padding: '0 10px', fontSize: '.72rem', fontWeight: navSel === m.id ? 700 : 400, background: navSel === m.id ? 'var(--blue-bg2)' : 'none', color: navSel === m.id ? 'var(--c-blue)' : 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</button>
              ))}
            </div>
            {/* 中央編集 */}
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 18px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <b style={{ flex: 1, fontSize: '.84rem' }}>{navSel === 'basic' ? '基本情報' : selMenu?.name ?? ''}</b>
                <button aria-label="閉じる" onClick={() => setEditing('')} style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', marginRight: -10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              {navSel === 'basic' ? (
                <div>
                  <div style={LBL}>公開状態{pendingOf('visibility', null, brand.id) && AMBER()}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{ fontSize: '.76rem', fontWeight: 500 }}>{brand.active ? '公開中' : '非公開'}</span>
                    {!pendingOf('visibility', null, brand.id) && (
                      <button disabled={busy} onClick={() => call('POST', { kind: 'visibility', service_id: brand.id, value: !brand.active }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>{brand.active ? '非公開を申請' : '公開を申請'}</button>
                    )}
                  </div>
                  <div style={LBL}>イメージ画像URL（申請制）{pendingOf('image', null, brand.id) && AMBER()}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input value={d('img:' + brand.id, brand.image_url ?? '')} onChange={e => setDraft(p => ({ ...p, ['img:' + brand.id]: e.target.value }))} placeholder="https://…" style={FLD} />
                    <button disabled={busy || !!pendingOf('image', null, brand.id)} onClick={() => call('POST', { kind: 'image', service_id: brand.id, value: d('img:' + brand.id, brand.image_url ?? '') }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
                  </div>
                  <div style={LBL}>社内向けメモ（すぐ反映）</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea rows={3} value={d('memo:' + brand.id, brand.supplier_memo ?? '')} onChange={e => setDraft(p => ({ ...p, ['memo:' + brand.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical', minHeight: 64 }} />
                    <button disabled={busy} onClick={() => call('PATCH', { service_id: brand.id, supplier_memo: d('memo:' + brand.id, brand.supplier_memo ?? '') }, 'メモを保存しました')} style={BTN}>保存</button>
                  </div>
                </div>
              ) : selMenu ? (
                <div>
                  <div style={LBL}>メニュー名（申請制）{pendingOf('menu_name', selMenu.id) && AMBER()}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input value={d('mn:' + selMenu.id, selMenu.name)} onChange={e => setDraft(p => ({ ...p, ['mn:' + selMenu.id]: e.target.value }))} style={FLD} />
                    <button disabled={busy || !!pendingOf('menu_name', selMenu.id)} onClick={() => call('POST', { kind: 'menu_name', service_id: brand.id, menu_id: selMenu.id, value: d('mn:' + selMenu.id, selMenu.name) }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
                  </div>
                  <div style={{ borderTop: LINE, paddingTop: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.03em', marginBottom: 8 }}>紹介報酬（すぐ反映）</div>
                    {data.rewards.filter(r => r.menu_id === selMenu.id).length === 0 ? (
                      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', margin: 0 }}>報酬が未設定です。設定はMB Partnersへご相談ください。</p>
                    ) : data.rewards.filter(r => r.menu_id === selMenu.id).map(r => (
                      <div key={r.id} style={{ marginBottom: 10 }}>
                        <div style={LBL}>{r.reward_type === 'fixed' ? '固定（円）' : r.reward_base === '売上' ? '受注額（%）' : '率（%）'}</div>
                        <input inputMode="numeric" value={d('rv:' + r.id, String(r.reward_value))} onChange={e => setDraft(p => ({ ...p, ['rv:' + r.id]: e.target.value }))} style={{ ...FLD, maxWidth: 180, fontFamily: 'Inter', textAlign: 'right' }} />
                      </div>
                    ))}
                    {data.rewards.some(r => r.menu_id === selMenu.id) && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button disabled={busy} onClick={saveRewards} style={{ ...BTN, color: '#fff', background: 'var(--c-blue)', minHeight: 40, padding: '0 20px' }}>保存する</button>
                      </div>
                    )}
                  </div>
                  <div style={{ borderTop: LINE, paddingTop: 12 }}>
                    <div style={LBL}>顧客向け説明（申請制）{pendingOf('public_description', selMenu.id) && AMBER()}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <textarea rows={3} value={d('pd:' + selMenu.id, selMenu.public_description ?? '')} onChange={e => setDraft(p => ({ ...p, ['pd:' + selMenu.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical', minHeight: 68 }} />
                      <button disabled={busy || !!pendingOf('public_description', selMenu.id)} onClick={() => call('POST', { kind: 'public_description', service_id: brand.id, menu_id: selMenu.id, value: d('pd:' + selMenu.id, selMenu.public_description ?? '') }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>,
        document.body
      )}
      {toast && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '10px 2px 0' }}>{toast}</p>}
      <style>{`@media (max-width: 640px){ .prod-lnav{width:112px !important} }`}</style>
    </div>
  )
}
