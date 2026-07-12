'use client'
/**
 * 商品 v2（設計図§4・マスタ文法の移植）。
 * 左ペイン=ブランドカード（公開状態バッジ・公開を申請・社内メモ）＋メニュー一覧（選択式）。
 * 右ペイン=選択中メニューの編集のみ（1画面1メニュー）: 基本（名前※申請制）→紹介報酬（即時・保存は節末に1つ）→
 * 顧客向け（説明・画像URL※申請制）。申請中はフィールド横に琥珀バッジ。SP=段階遷移（一覧→編集・戻る）。
 * データ・境界・ガードは /api/supplier/self（セッションスコープ）。
 */
import { useEffect, useMemo, useState } from 'react'

type Brand = { id: string; name: string; active: boolean; supplier_memo: string | null; image_url: string | null }
type Menu = { id: string; name: string; service_id: string; public_description: string | null }
type Reward = { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }
type Req = { id: string; kind: string; menu_id: string | null; service_id: string; payload: { value?: unknown }; status: string; reason: string | null }
const LINE = '0.5px solid var(--line)'

export default function ProductsClient() {
  const [data, setData] = useState<{ brands: Brand[]; menus: Menu[]; rewards: Reward[]; requests: Req[] } | null>(null)
  const [selMenu, setSelMenu] = useState<string>('')
  const [spEdit, setSpEdit] = useState(false)   // SP段階遷移: 一覧→編集
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const load = () => fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(d => { setData(d); if (d?.menus?.length && !selMenu) setSelMenu(d.menus[0].id) }).catch(() => {})
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000) }
  const d = (k: string, fb: string) => draft[k] ?? fb

  const menu = useMemo(() => data?.menus.find(m => m.id === selMenu) ?? null, [data, selMenu])
  const brand = useMemo(() => data?.brands.find(b => b.id === menu?.service_id) ?? null, [data, menu])
  const pendingOf = (kind: string, menuId?: string | null, serviceId?: string) =>
    (data?.requests ?? []).find(r => r.status === 'pending' && r.kind === kind && (menuId ? r.menu_id === menuId : r.service_id === serviceId && !r.menu_id))

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
  // 紹介報酬: 節末の1保存で変更分をまとめて反映（即時系）
  async function saveRewards() {
    const targets = (data?.rewards ?? []).filter(r => r.menu_id === selMenu && draft['rv:' + r.id] != null && Number(draft['rv:' + r.id]) !== Number(r.reward_value))
    if (!targets.length) { say('変更はありません'); return }
    for (const r of targets) {
      const ok = await call('PATCH', { reward_id: r.id, reward_value: Number(draft['rv:' + r.id]) }, '紹介報酬を保存しました（すぐに反映・MB Partnersに通知）')
      if (!ok) return
    }
  }

  if (!data) return <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>読み込み中…</p>
  if (!data.brands.length) return <p style={{ fontSize: '.74rem', color: 'var(--muted2)' }}>ブランドがまだありません。搭載についてはMB Partnersへご相談ください。</p>

  const AMBER = (label = '申請中') => <span style={{ fontSize: '.54rem', fontWeight: 700, color: '#8a6100', background: 'rgba(224,168,0,.14)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>{label}</span>
  const FLD: React.CSSProperties = { width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 8, border: LINE, fontSize: '.76rem', fontFamily: 'inherit', boxSizing: 'border-box' }
  const BTN: React.CSSProperties = { fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 500, minHeight: 38, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', color: 'var(--c-blue)', background: 'var(--blue-bg2)', flexShrink: 0 }
  const LBL: React.CSSProperties = { fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }
  const SEC: React.CSSProperties = { background: '#fff', border: LINE, borderRadius: 13, padding: '14px 16px', marginBottom: 12 }

  const LeftPane = (
    <div>
      {data.brands.map(br => (
        <div key={br.id} style={{ background: '#fff', border: LINE, borderRadius: 13, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: LINE }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ flex: 1, minWidth: 0, fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{br.name}</b>
              <span style={{ fontSize: '.56rem', fontWeight: 700, borderRadius: 999, padding: '2px 9px', background: br.active ? 'rgba(21,145,126,.12)' : 'var(--bg2)', color: br.active ? '#0f9d76' : 'var(--muted2)', flexShrink: 0 }}>{br.active ? '公開中' : '非公開'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {pendingOf('visibility', null, br.id)
                ? AMBER('公開状態 申請中')
                : <button disabled={busy} onClick={() => call('POST', { kind: 'visibility', service_id: br.id, value: !br.active }, '申請しました（MB Partnersの確認後に反映）')} style={{ ...BTN, minHeight: 32, fontSize: '.62rem' }}>{br.active ? '非公開を申請' : '公開を申請'}</button>}
            </div>
          </div>
          {data.menus.filter(m => m.service_id === br.id).map(m => {
            const on = m.id === selMenu
            return (
              <button key={m.id} onClick={() => { setSelMenu(m.id); setSpEdit(true) }}
                style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--blue-bg2)' : 'none', border: 'none', borderTop: LINE, minHeight: 44, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.76rem', fontWeight: on ? 700 : 400, color: on ? 'var(--c-blue)' : 'var(--txt)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                {pendingOf('menu_name', m.id) || pendingOf('public_description', m.id) ? AMBER() : null}
                <span style={{ color: 'var(--muted)' }}>›</span>
              </button>
            )
          })}
          <div style={{ padding: '10px 14px', borderTop: LINE }}>
            <div style={LBL}>社内向けメモ（すぐ反映・お客さまには表示されません）</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea rows={2} value={d('memo:' + br.id, br.supplier_memo ?? '')} onChange={e => setDraft(p => ({ ...p, ['memo:' + br.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical', minHeight: 52 }} />
              <button disabled={busy} onClick={() => call('PATCH', { service_id: br.id, supplier_memo: d('memo:' + br.id, br.supplier_memo ?? '') }, 'メモを保存しました')} style={BTN}>保存</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const RightPane = menu && brand ? (
    <div>
      <button className="prod-back" onClick={() => setSpEdit(false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', color: 'var(--muted2)', padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 4 }}>← メニュー一覧</button>
      <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 8 }}>{brand.name} ─ <b style={{ color: 'var(--txt)' }}>{menu.name}</b></div>

      {/* 基本（メニュー名※申請制） */}
      <div style={SEC}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: 10 }}>基本</div>
        <div style={LBL}>メニュー名（申請制）{pendingOf('menu_name', menu.id) && AMBER()}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={d('mn:' + menu.id, menu.name)} onChange={e => setDraft(p => ({ ...p, ['mn:' + menu.id]: e.target.value }))} style={FLD} />
          <button disabled={busy || !!pendingOf('menu_name', menu.id)} onClick={() => call('POST', { kind: 'menu_name', service_id: brand.id, menu_id: menu.id, value: d('mn:' + menu.id, menu.name) }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
        </div>
      </div>

      {/* 紹介報酬（即時・保存は節末に1つ） */}
      <div style={SEC}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: 10 }}>紹介報酬（すぐ反映）</div>
        {data.rewards.filter(r => r.menu_id === menu.id).length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', margin: 0 }}>報酬が未設定です。設定はMB Partnersへご相談ください。</p>
        ) : data.rewards.filter(r => r.menu_id === menu.id).map(r => (
          <div key={r.id} style={{ marginBottom: 10 }}>
            <div style={LBL}>{r.reward_type === 'fixed' ? '固定（円）' : r.reward_base === '売上' ? '受注額（%）' : '率（%）'}</div>
            <input inputMode="numeric" value={d('rv:' + r.id, String(r.reward_value))} onChange={e => setDraft(p => ({ ...p, ['rv:' + r.id]: e.target.value }))}
              style={{ ...FLD, maxWidth: 180, fontFamily: 'Inter', textAlign: 'right' }} />
          </div>
        ))}
        {data.rewards.some(r => r.menu_id === menu.id) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: LINE, paddingTop: 10 }}>
            <button disabled={busy} onClick={saveRewards} style={{ ...BTN, color: '#fff', background: 'var(--c-blue)', minHeight: 40, padding: '0 20px' }}>保存する</button>
          </div>
        )}
      </div>

      {/* 顧客向け（説明・画像URL※申請制） */}
      <div style={SEC}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, marginBottom: 4 }}>顧客向け</div>
        <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: '0 0 10px' }}>お客さまのページに表示されます（MB Partnersの確認後に反映）。</p>
        <div style={LBL}>説明{pendingOf('public_description', menu.id) && AMBER()}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <textarea rows={3} value={d('pd:' + menu.id, menu.public_description ?? '')} onChange={e => setDraft(p => ({ ...p, ['pd:' + menu.id]: e.target.value }))} style={{ ...FLD, resize: 'vertical', minHeight: 68 }} />
          <button disabled={busy || !!pendingOf('public_description', menu.id)} onClick={() => call('POST', { kind: 'public_description', service_id: brand.id, menu_id: menu.id, value: d('pd:' + menu.id, menu.public_description ?? '') }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
        </div>
        <div style={LBL}>イメージ画像URL（ブランド共通）{pendingOf('image', null, brand.id) && AMBER()}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={d('img:' + brand.id, brand.image_url ?? '')} onChange={e => setDraft(p => ({ ...p, ['img:' + brand.id]: e.target.value }))} placeholder="https://…" style={FLD} />
          <button disabled={busy || !!pendingOf('image', null, brand.id)} onClick={() => call('POST', { kind: 'image', service_id: brand.id, value: d('img:' + brand.id, brand.image_url ?? '') }, '申請しました（MB Partnersの確認後に反映）')} style={BTN}>申請</button>
        </div>
      </div>
    </div>
  ) : <p style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>左の一覧からメニューを選択してください。</p>

  return (
    <div>
      <div className={'prod-grid' + (spEdit ? ' sp-edit' : '')} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <div className="prod-left">{LeftPane}</div>
        <div className="prod-right">{RightPane}</div>
      </div>
      {toast && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '10px 2px 0' }}>{toast}</p>}
      <style>{`
        .prod-right{display:none}
        .prod-grid.sp-edit .prod-left{display:none}
        .prod-grid.sp-edit .prod-right{display:block}
        @media (min-width:1024px){
          .prod-grid{grid-template-columns:300px 1fr !important}
          .prod-left{display:block !important}
          .prod-right{display:block !important}
          .prod-back{display:none !important}
        }
      `}</style>
    </div>
  )
}
