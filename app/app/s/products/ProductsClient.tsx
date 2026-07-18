'use client'
/**
 * サービスマスタ v8（MBコンソール ServicesClient と同一の3ペイン文法）:
 * 一覧＝1行1ブランド（ServiceAvatar・カテゴリ・公開状態・›）→行クリックで全画面級ドロワー
 * （左ナビ132px=基本情報＋メニュー列／中央=フラットフォーム編集／右=APPライブプレビュー）。
 * 反映の二層＝すぐ反映（紹介報酬・社内メモ=「保存する」）／申請して反映（パートナー・顧客に見える
 * 全項目=差分をまとめて「変更を申請」・MB Partners確認後にAPPへ）。
 * データ・境界は /api/supplier/self（セッションスコープ）。ドロワーはcreatePortal（包含ブロック事故回避）。
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import ServiceAvatar from '@/components/ServiceAvatar'
import { rewardValueText } from '@/lib/reward-format'
import MenuOpsEditor from './MenuOpsEditor'

type Brand = { id: string; name: string; active: boolean; supplier_memo: string | null; image_url: string | null; logo_path: string | null; icon: string | null; color: string | null; category: string | null; subtitle: string | null; description: string | null; who: string | null; target_audience: string | null; url: string | null }
type Menu = { id: string; name: string; service_id: string; public_description: string | null; short_description: string | null; description: string | null; active?: boolean }
type Reward = { id: string; menu_id: string; reward_type: string; reward_value: number; reward_base: string | null }
type Req = { id: string; kind: string; menu_id: string | null; service_id: string; payload: { value?: unknown }; status: string; reason: string | null }
const LINE = '0.5px solid var(--line)'
const inputStyle: React.CSSProperties = { border: LINE, borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.82rem', color: 'var(--txt)', background: '#fff', width: '100%', boxSizing: 'border-box' }

/** MBサービスマスタ編集と同一のグループ区切り（0.5px罫線＋11pxマイクロ見出し・箱なし） */
function Group({ label, first, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: first ? 'none' : LINE, marginTop: first ? 0 : 16, paddingTop: first ? 0 : 14 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}

/** 画像アップロード（server経由・service-logosバケット）→ 値を申請draftへ（承認までは表示に出ない） */
function AssetUpload({ serviceId, kind, onDone }: { serviceId: string; kind: 'logo' | 'image'; onDone: (v: string) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <label className="ui-btn ui-btn--ghost" style={{ fontSize: '.66rem', padding: '7px 12px', cursor: 'pointer', flexShrink: 0 }}>
      {busy ? '送信中…' : 'アップロード'}
      <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy} onChange={async e => {
        const f = e.target.files?.[0]; if (!f) return
        setBusy(true)
        try {
          const fd = new FormData(); fd.append('service_id', serviceId); fd.append('kind', kind); fd.append('file', f)
          const r = await fetch('/api/supplier/asset', { method: 'POST', body: fd })
          const j = await r.json().catch(() => ({}))
          if (r.ok) onDone(kind === 'logo' ? j.path : j.url)
        } finally { setBusy(false); e.target.value = '' }
      }} />
    </label>
  )
}

function Fld({ label, pending, children }: { label: string; pending?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.03em', display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {pending && <span style={{ fontSize: '.54rem', fontWeight: 700, color: '#8a6100', background: 'rgba(224,168,0,.14)', borderRadius: 999, padding: '1px 8px' }}>申請中</span>}
      </label>
      {children}
    </div>
  )
}

export default function ProductsClient() {
  const [data, setData] = useState<{ brands: Brand[]; menus: Menu[]; rewards: Reward[]; requests: Req[] } | null>(null)
  const [editing, setEditing] = useState<string>('')
  const [navSel, setNavSel] = useState<string>('basic')
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
  const pendingOf = (kind: string, menuId?: string | null) =>
    (data?.requests ?? []).some(r => r.status === 'pending' && r.kind === kind && (menuId ? r.menu_id === menuId : r.service_id === editing && !r.menu_id))
  const brandPending = (id: string) => (data?.requests ?? []).filter(r => r.status === 'pending' && r.service_id === id).length

  // 申請対象フィールド（差分だけまとめて申請）
  const requestFields = useMemo(() => {
    if (!brand) return [] as { key: string; kind: string; cur: string; menu_id?: string }[]
    const f: { key: string; kind: string; cur: string; menu_id?: string }[] = [
      { key: 'subtitle:' + brand.id, kind: 'subtitle', cur: brand.subtitle ?? '' },
      { key: 'category:' + brand.id, kind: 'category', cur: brand.category ?? '' },
      { key: 'description:' + brand.id, kind: 'description', cur: brand.description ?? '' },
      { key: 'audience:' + brand.id, kind: 'target_audience', cur: brand.target_audience ?? '' },
      { key: 'who:' + brand.id, kind: 'who', cur: brand.who ?? '' },
      { key: 'url:' + brand.id, kind: 'url', cur: brand.url ?? '' },
      { key: 'img:' + brand.id, kind: 'image', cur: brand.image_url ?? '' },
      { key: 'logo:' + brand.id, kind: 'logo', cur: brand.logo_path ?? '' },
    ]
    for (const m of brandMenus) {
      f.push({ key: 'mn:' + m.id, kind: 'menu_name', cur: m.name, menu_id: m.id })
      f.push({ key: 'msd:' + m.id, kind: 'menu_short_description', cur: m.short_description ?? '', menu_id: m.id })
      f.push({ key: 'md:' + m.id, kind: 'menu_description', cur: m.description ?? '', menu_id: m.id })
      f.push({ key: 'pd:' + m.id, kind: 'public_description', cur: m.public_description ?? '', menu_id: m.id })
    }
    return f
  }, [brand, brandMenus])
  const dirtyRequests = requestFields.filter(f => draft[f.key] != null && draft[f.key].trim() !== f.cur)

  async function call(method: 'PATCH' | 'POST', body: Record<string, unknown>, okMsg: string) {
    if (busy) return false
    setBusy(true)
    const r = await fetch('/api/supplier/self', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (okMsg || !r.ok) say(r.ok ? (j.warning ? `${okMsg} ／ ⚠ ${j.warning}` : okMsg) : (j.error ?? '失敗しました'))
    if (r.ok) await load()
    setBusy(false)
    return r.ok
  }
  // すぐ反映（報酬・メモ）の一括保存
  async function saveInstant() {
    if (!brand) return
    let saved = 0
    const memoKey = 'memo:' + brand.id
    if (draft[memoKey] != null && draft[memoKey] !== (brand.supplier_memo ?? '')) {
      if (await call('PATCH', { service_id: brand.id, supplier_memo: draft[memoKey] }, '')) saved++
    }
    for (const r of (data?.rewards ?? []).filter(r => brandMenus.some(m => m.id === r.menu_id))) {
      const k = 'rv:' + r.id
      if (draft[k] != null && Number(draft[k]) !== Number(r.reward_value)) {
        if (await call('PATCH', { reward_id: r.id, reward_value: Number(draft[k]) }, '')) saved++
        else return
      }
    }
    say(saved ? '保存しました（すぐに反映されます）' : '変更はありません')
  }
  // 申請（差分をまとめて）
  async function submitRequests() {
    if (!brand || !dirtyRequests.length) { say('申請する変更はありません'); return }
    const ok = await call('POST', { kind: 'batch_request', service_id: brand.id, requests: dirtyRequests.map(f => ({ kind: f.kind, menu_id: f.menu_id ?? null, value: draft[f.key] })) }, `${dirtyRequests.length}件の変更を申請しました（MB Partnersの確認後にAPPへ反映）`)
    if (ok) setDraft(p => { const n = { ...p }; for (const f of dirtyRequests) delete n[f.key]; return n })
  }

  if (!data) return <div className="ui-skeleton" style={{ height: 120, borderRadius: 14 }} />
  if (!data.brands.length) return <p style={{ fontSize: '.78rem', color: 'var(--muted2)' }}>サービスがありません。搭載についてはMB Partnersへご相談ください。</p>

  const NAVB = (on: boolean): React.CSSProperties => ({ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 8, minHeight: 36, padding: '0 10px', fontSize: '.74rem', fontWeight: on ? 700 : 400, background: on ? 'var(--blue-bg2)' : 'none', color: on ? 'var(--c-blue)' : 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
  const pv = (key: string, cur: string) => (draft[key] ?? cur)

  return (
    <div>
      {/* 一覧（ServicesClientと同一の1行文法） */}
      <div style={{ background: 'var(--s-0, #fff)', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
        {data.brands.map((br, i) => (
          <button key={br.id} onClick={() => { setEditing(br.id); setNavSel('basic') }}
            style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : LINE, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ServiceAvatar logoPath={br.logo_path} icon={br.icon ?? 'arrows'} color={br.color ?? '#4733e6'} name={br.name} size={28} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--txt)' }}>{br.name}</span>
              {br.category && <span style={{ fontSize: 11, color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{br.category}</span>}
              {brandPending(br.id) > 0 && <span style={{ fontSize: '.54rem', fontWeight: 700, color: '#8a6100', background: 'rgba(224,168,0,.14)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>申請中 {brandPending(br.id)}</span>}
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

      {/* ドロワー（ServicesClientと同じ3ペイン: 左ナビ132px／中央フラットフォーム／右APPライブプレビュー） */}
      {brand && typeof document !== 'undefined' && createPortal(
        <>
          <div onClick={() => setEditing('')} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', backdropFilter: 'blur(2px)', zIndex: 40 }} />
          <div className="exp-in prod-drawer" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 1060, maxWidth: '97vw', background: 'var(--bg2)', zIndex: 45, boxShadow: '-12px 0 40px rgba(14,14,20,.18)', display: 'flex', overflow: 'hidden' }}>
            {/* 左ナビ 132px */}
            <div className="prod-lnav" style={{ width: 132, flexShrink: 0, background: '#fff', borderRight: LINE, overflowY: 'auto', padding: '14px 8px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 500, padding: '0 8px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</div>
              <button onClick={() => setNavSel('basic')} style={NAVB(navSel === 'basic')}>基本情報</button>
              <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', padding: '12px 10px 4px' }}>メニュー</div>
              {brandMenus.map(m => <button key={m.id} onClick={() => setNavSel(m.id)} style={NAVB(navSel === m.id)}>{pv('mn:' + m.id, m.name)}</button>)}
              {/* 完全等価化A: メニュー新設は申請制（承認で作成） */}
              {pendingOf('menu_create') ? (
                <div style={{ fontSize: '.6rem', color: '#8a6100', padding: '8px 10px' }}>メニュー追加を申請中</div>
              ) : (
                <button onClick={() => { const nm = window.prompt('新しいメニュー名（MB Partnersの確認後に作成されます）'); if (nm && nm.trim()) call('POST', { kind: 'menu_create', service_id: brand.id, value: nm.trim() }, 'メニュー追加を申請しました（MB Partnersの確認後に作成）') }}
                  style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderRadius: 8, minHeight: 34, padding: '0 10px', fontSize: '.7rem', fontWeight: 500, background: 'none', color: 'var(--c-blue)' }}>＋ メニューを追加（申請）</button>
              )}
            </div>

            {/* 中央フラットフォーム（MBと同構造: flex列＝スクロール子＋下部固定フッター兄弟。absolute-in-scroller事故の根治） */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '16px 20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <b style={{ flex: 1, fontSize: '.88rem', fontWeight: 500 }}>{navSel === 'basic' ? '基本情報' : pv('mn:' + (selMenu?.id ?? ''), selMenu?.name ?? '')}</b>
                <button aria-label="閉じる" onClick={() => setEditing('')} style={{ width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', marginRight: -10 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>

              {navSel === 'basic' ? (
                <div>
                  <Group label="表示（申請して反映＝パートナー・お客さまに見える項目）" first>
                  <Fld label="サービス名"><input value={brand.name} readOnly style={{ ...inputStyle, background: 'var(--bg2)', color: 'var(--muted2)' }} /></Fld>
                  <Fld label="サブタイトル（申請制）" pending={pendingOf('subtitle')}><input value={d('subtitle:' + brand.id, brand.subtitle ?? '')} onChange={e => setDraft(p => ({ ...p, ['subtitle:' + brand.id]: e.target.value }))} placeholder="賃貸仲介プラットフォーム" style={inputStyle} /></Fld>
                  <Fld label="カテゴリ（申請制）" pending={pendingOf('category')}><input value={d('category:' + brand.id, brand.category ?? '')} onChange={e => setDraft(p => ({ ...p, ['category:' + brand.id]: e.target.value }))} placeholder="例：不動産 / 人材 / 保険" style={inputStyle} /></Fld>
                  <Fld label="サービス概要（申請制）" pending={pendingOf('description')}><textarea rows={3} value={d('description:' + brand.id, brand.description ?? '')} onChange={e => setDraft(p => ({ ...p, ['description:' + brand.id]: e.target.value }))} placeholder="サービスの概要を記載" style={{ ...inputStyle, resize: 'vertical' }} /></Fld>
                  <Fld label="こんなお客さまに（申請制）" pending={pendingOf('target_audience')}><input value={d('audience:' + brand.id, brand.target_audience ?? '')} onChange={e => setDraft(p => ({ ...p, ['audience:' + brand.id]: e.target.value }))} placeholder="例：投資用マンションを検討している人" style={inputStyle} /></Fld>
                  <Fld label="紹介しやすい方（申請制）" pending={pendingOf('who')}><input value={d('who:' + brand.id, brand.who ?? '')} onChange={e => setDraft(p => ({ ...p, ['who:' + brand.id]: e.target.value }))} placeholder="不動産・保険に関心のあるお客さまと接する方" style={inputStyle} /></Fld>
                  <Fld label="WebサイトURL（申請制）" pending={pendingOf('url')}><input value={d('url:' + brand.id, brand.url ?? '')} onChange={e => setDraft(p => ({ ...p, ['url:' + brand.id]: e.target.value }))} placeholder="https://example.com" style={inputStyle} /></Fld>
                  <Fld label="イメージ画像（申請制）" pending={pendingOf('image')}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={d('img:' + brand.id, brand.image_url ?? '')} onChange={e => setDraft(p => ({ ...p, ['img:' + brand.id]: e.target.value }))} placeholder="https://…（アップロードでも設定できます）" style={{ ...inputStyle, flex: 1 }} />
                      <AssetUpload serviceId={brand.id} kind="image" onDone={v => setDraft(p => ({ ...p, ['img:' + brand.id]: v }))} />
                    </div>
                  </Fld>
                  <Fld label="ロゴ画像（申請制）" pending={pendingOf('logo')}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ flex: 1, fontSize: '.7rem', color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d('logo:' + brand.id, brand.logo_path ?? '') || '未設定'}</span>
                      <AssetUpload serviceId={brand.id} kind="logo" onDone={v => setDraft(p => ({ ...p, ['logo:' + brand.id]: v }))} />
                    </div>
                  </Fld>
                  </Group>
                  <Group label="公開状態（申請して反映）">
                  <Fld label="現在の状態" pending={pendingOf('visibility')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '.8rem' }}>{brand.active ? '公開中' : '非公開'}</span>
                      {!pendingOf('visibility') && (
                        <button disabled={busy} onClick={() => call('POST', { kind: 'visibility', service_id: brand.id, value: !brand.active }, '申請しました（MB Partnersの確認後に反映）')} className="ui-btn ui-btn--ghost" style={{ fontSize: '.68rem', padding: '6px 12px' }}>{brand.active ? '非公開を申請' : '公開を申請'}</button>
                      )}
                    </div>
                  </Fld>
                  </Group>
                  <Group label="社内（すぐ反映・お客さまには表示されません）">
                  <Fld label="社内向けメモ"><textarea rows={2} value={d('memo:' + brand.id, brand.supplier_memo ?? '')} onChange={e => setDraft(p => ({ ...p, ['memo:' + brand.id]: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></Fld>
                  </Group>
                </div>
              ) : selMenu ? (
                <div>
                  <Group label="表示（申請して反映＝パートナー・お客さまに見える項目）" first>
                  <Fld label="メニュー名（申請制）" pending={pendingOf('menu_name', selMenu.id)}><input value={d('mn:' + selMenu.id, selMenu.name)} onChange={e => setDraft(p => ({ ...p, ['mn:' + selMenu.id]: e.target.value }))} style={inputStyle} /></Fld>
                  <Fld label="ひとこと説明（一覧に表示・申請制）" pending={pendingOf('menu_short_description', selMenu.id)}><input value={d('msd:' + selMenu.id, selMenu.short_description ?? '')} onChange={e => setDraft(p => ({ ...p, ['msd:' + selMenu.id]: e.target.value }))} placeholder="例：お客さまを紹介するだけ。実務は当社が対応。" style={inputStyle} /></Fld>
                  <Fld label="詳しい説明（詳細シートに表示・申請制）" pending={pendingOf('menu_description', selMenu.id)}><textarea rows={3} value={d('md:' + selMenu.id, selMenu.description ?? '')} onChange={e => setDraft(p => ({ ...p, ['md:' + selMenu.id]: e.target.value }))} placeholder="例：お客さまの状況を伺い、最適なプランをご提案します" style={{ ...inputStyle, resize: 'vertical' }} /></Fld>
                  <Fld label="顧客向け説明（相談ページに表示・申請制）" pending={pendingOf('public_description', selMenu.id)}><textarea rows={3} value={d('pd:' + selMenu.id, selMenu.public_description ?? '')} onChange={e => setDraft(p => ({ ...p, ['pd:' + selMenu.id]: e.target.value }))} style={{ ...inputStyle, resize: 'vertical' }} /></Fld>
                  <Fld label="このメニューの公開状態（申請制）" pending={pendingOf('menu_visibility', selMenu.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '.8rem' }}>{selMenu.active === false ? '非公開' : '公開中'}</span>
                      {!pendingOf('menu_visibility', selMenu.id) && (
                        <button disabled={busy} onClick={() => call('POST', { kind: 'menu_visibility', service_id: brand.id, menu_id: selMenu.id, value: selMenu.active === false }, '申請しました（MB Partnersの確認後に反映）')} className="ui-btn ui-btn--ghost" style={{ fontSize: '.68rem', padding: '6px 12px' }}>{selMenu.active === false ? '公開を申請' : '非公開を申請'}</button>
                      )}
                    </div>
                  </Fld>
                  </Group>
                  <Group label="報酬・協力タスク・ヒアリング項目（すぐ反映＝MB Partnersに通知されます）">
                    <MenuOpsEditor menuId={selMenu.id} onSaved={load} />
                  </Group>
                </div>
              ) : null}

            </div>
              {/* フッター保存ゾーン（反映の二層が一目で分かる2動詞・結果/バリデーションはここに表示＝MBの下部固定保存と同文法） */}
              <div style={{ flexShrink: 0, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)', borderTop: LINE, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="prod-savehint" style={{ flex: 1, fontSize: '.62rem', color: toast && /失敗|エラー|⚠/.test(toast) ? 'var(--red)' : 'var(--muted2)' }}>{toast || (dirtyRequests.length > 0 ? `表示に関わる変更 ${dirtyRequests.length}件（要MB Partners確認）` : '表示に関わる変更は申請すると反映されます')}</span>
                <button disabled={busy} onClick={saveInstant} className="ui-btn ui-btn--ghost" style={{ fontSize: '.72rem', padding: '9px 16px' }}>保存する</button>
                <button disabled={busy || dirtyRequests.length === 0} onClick={submitRequests} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '9px 18px', opacity: dirtyRequests.length === 0 ? .5 : 1 }}>変更を申請{dirtyRequests.length > 0 ? `（${dirtyRequests.length}）` : ''}</button>
              </div>
            </div>

            {/* 右: APPライブプレビュー（編集が即反映） */}
            <div className="prod-preview" style={{ width: 320, flexShrink: 0, borderLeft: LINE, background: '#F4F4F7', overflowY: 'auto', padding: '16px 14px' }}>
              <div style={{ fontSize: '.56rem', fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.08em', marginBottom: 10 }}>APPでの見え方（プレビュー）</div>
              <div style={{ background: '#fff', border: LINE, borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ServiceAvatar logoPath={brand.logo_path} icon={brand.icon ?? 'arrows'} color={brand.color ?? '#4733e6'} name={brand.name} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{brand.name}</div>
                      {pv('subtitle:' + brand.id, brand.subtitle ?? '') && <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{pv('subtitle:' + brand.id, brand.subtitle ?? '')}</div>}
                    </div>
                  </div>
                  {pv('audience:' + brand.id, brand.target_audience ?? '') && <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6, margin: 0 }}>{pv('audience:' + brand.id, brand.target_audience ?? '')}</p>}
                </div>
                <div style={{ borderTop: LINE, padding: '0 16px' }}>
                  {brandMenus.map(m => {
                    const reward = data.rewards.find(r => r.menu_id === m.id)
                    return (
                      <div key={m.id} style={{ borderTop: LINE, padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pv('mn:' + m.id, m.name)}</span>
                          {reward && (
                            <span className="no-break" style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-blue)', background: 'var(--blue-bg2)', borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
                              報酬 {rewardValueText({ reward_type: reward.reward_type as never, reward_value: Number(d('rv:' + reward.id, String(reward.reward_value))), reward_base: reward.reward_base })}
                            </span>
                          )}
                        </span>
                        {pv('msd:' + m.id, m.short_description ?? '') && <span style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.5 }}>{pv('msd:' + m.id, m.short_description ?? '')}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
              <p style={{ fontSize: '.56rem', color: 'var(--muted)', margin: '10px 2px 0', lineHeight: 1.7 }}>申請した変更は、MB Partnersの確認後にこの形でパートナーのアプリに表示されます。</p>
            </div>
          </div>
        </>,
        document.body
      )}
      {toast && <p style={{ fontSize: '.68rem', color: 'var(--muted2)', margin: '10px 2px 0' }}>{toast}</p>}
      <style>{`
        @media (max-width: 1279px){ .prod-preview{display:none} }
        @media (max-width: 640px){ .prod-lnav{width:104px !important} .prod-savehint{display:none} }
      `}</style>
    </div>
  )
}
