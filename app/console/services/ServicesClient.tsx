'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import PageGuide from '@/components/PageGuide'
import { GUIDE_SERVICES } from '@/lib/console-guides'
import { createClient } from '@/lib/supabase/client'
import ServiceAvatar from '@/components/ServiceAvatar'
import HearingItemsEditor from './HearingItemsEditor'
import MenuDetailSheet, { type SheetMenuItem, type SheetReward } from '@/components/MenuDetailSheet'
import type { ServiceWithMenus, MenuRow, Menu, MenuReward } from '@/lib/supabase/queries'
import { parseAmount } from '@/lib/num'
import { rewardValueText } from '@/lib/reward-format'
import RewardPill from '@/components/ui/RewardPill'
import { resolveMenuCoopTasks, type CoopTaskItem } from '@/lib/coop-task-display'

// ─── Constants ────────────────────────────────────────────────────────────────

// 是正2：協力タスク6マスタ（全サービス共通の選択肢・メニューごとに使うものを選ぶ）。
// auto=自動検知（案件進行で達成）／manual=手動（パートナーが実施）。
const COOP_TASK_MASTER: { label: string; kind: 'auto' | 'manual' }[] = [
  { label: 'つなぐ',           kind: 'auto' },
  { label: 'アポイント',        kind: 'auto' },
  { label: 'ヒヤリング',        kind: 'manual' },
  { label: 'アシスト/フォロー', kind: 'manual' },
  { label: '価格/条件合意',     kind: 'manual' },
  { label: 'クロージング',      kind: 'manual' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

// 確定モック：メニュー＝名前＋報酬(複数)。報酬＝固定/粗利%・トリガー・協力タスク(6マスタ選択)。draft方式（保存で一括反映）。
type RewardDraft = {
  id: string | null            // null=新規 menu_reward
  reward_type: 'fixed' | 'rate' | 'continuous'  // continuous=継続（毎月）
  reward_value: string         // 継続のとき＝毎月の率(%)
  reward_months: string        // 継続のデフォルト期間（月数）
  reward_trigger: string
  tasks: string[]              // この報酬の協力タスクラベル
}
type MenuDraft = {
  id: string | null            // null=新規メニュー
  service_menu_id: string
  name: string
  short_description: string    // menus.short_description（APP一覧の一言説明・3ペイン化でドロワーに集約）
  description: string          // menus.description（APP詳細シート「このメニューでは」）
  public_description: string   // menus.public_description（顧客向け相談ページ /r/ の説明・顧客の言葉のみ）
  calendar_member_id: string   // 担当メンバー（''=既定・一覧v2で担当selectを3ペインへ移設）
  rewards: RewardDraft[]
}

// 協力タスクテンプレ行（cooperation_task_templates・reward_id 紐付けの読込/同期に使用）。
type Tpl = { id: string; service_id: string; menu_id: string | null; reward_id: string | null; label: string; kind: string; required: boolean; trigger_key: string | null; sort: number; active: boolean; description: string | null }

// 協力はメニュー単位（service_menus.coop_*）に一本化。サービス単位 coop_* は廃止。
type ServiceForm = {
  name: string; subtitle: string; description: string; who: string; url: string
  target_audience: string   // リファラルWave1：紹介対象（STEP1で太字表示）
  image_url: string         // menu_context v2：詳細シートのイメージ画像（任意）
  category: string          // 紹介入口v3：カテゴリ（一覧チップ絞り込み・任意）
  logo_path: string; active: boolean
  icon: string; color: string  // kept for backward compat, not shown in UI
}

const defaultServiceForm: ServiceForm = {
  name: '', subtitle: '', description: '', who: '', url: '', target_audience: '', image_url: '', category: '', logo_path: '',
  active: true, icon: 'arrows', color: '#4733e6',
}

function svcFormToPayload(f: ServiceForm) {
  return {
    name:           f.name,
    subtitle:       f.subtitle       || null,
    description:    f.description    || null,
    who:            f.who            || null,
    url:            f.url            || null,
    target_audience: f.target_audience || null,
    image_url:      f.image_url       || null,
    category:       f.category        || null,
    logo_path:      f.logo_path      || null,
    active:         f.active,
    icon:           f.icon,
    color:          f.color,
  }
}

function svcToForm(svc: ServiceWithMenus): ServiceForm {
  return {
    name:           svc.name,
    subtitle:       svc.subtitle    ?? '',
    description:    svc.description ?? '',
    who:            svc.who         ?? '',
    url:            svc.url         ?? '',
    target_audience: (svc as { target_audience?: string | null }).target_audience ?? '',
    image_url:      (svc as { image_url?: string | null }).image_url ?? '',
    category:       (svc as { category?: string | null }).category ?? '',
    logo_path:      svc.logo_path   ?? '',
    active:         svc.active,
    icon:           svc.icon        || 'arrows',
    color:          svc.color       || '#4733e6',
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

// 静音化v2：フラットフォームの基本文法＝ラベル11px/muted＋入力欄（0.5px罫線・radius8）。箱は作らない。
function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.03em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  border: '0.5px solid var(--line)', borderRadius: 8, padding: '8px 11px',
  fontFamily: 'inherit', fontSize: '.82rem', color: 'var(--txt)', background: '#fff',
  width: '100%', boxSizing: 'border-box',
}

function FInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return <input value={value} type={type} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
}

function FTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyle, resize: 'vertical' }} />
}

// 3ペイン左ナビ項目（12px・選択中=accent文字 var(--c-blue)・他は var(--txt)）。
const navItemStyle = (selected: boolean): React.CSSProperties => ({
  display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px',
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 500, lineHeight: 1.5,
  color: selected ? 'var(--c-blue)' : 'var(--txt)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
})

// ロゴ・イメージ画像の横並び2枠（同サイズ・入力欄と同じ0.5px罫線/radius8）。
const uploadBoxStyle: React.CSSProperties = {
  border: '0.5px solid var(--line)', borderRadius: 8, padding: 12, minHeight: 150,
  display: 'flex', flexDirection: 'column', justifyContent: 'center', boxSizing: 'border-box',
}

function Toggle2({ val, onA, onB, labelA, labelB }: {
  val: boolean; onA: () => void; onB: () => void; labelA: string; labelB: string
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {[{ active: !val, fn: onA, label: labelA }, { active: val, fn: onB, label: labelB }].map(({ active, fn, label }) => (
        <button key={label} type="button" onClick={fn} style={{
          flex: 1, padding: '8px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500,
          border: `1.5px solid ${active ? 'var(--blue)' : 'var(--line)'}`,
          background: active ? 'var(--blue-bg2)' : '#fff',
          color: active ? 'var(--blue)' : 'var(--muted2)',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ─── Service Logo (neutral placeholder when no logo) ──────────────────────────

// ロゴがあればロゴ、無ければ従来の色付きアイコンへフォールバック（共通 ServiceAvatar 経由）
function ServiceLogo({ logoPath, name, size = 44, icon = 'arrows', color = '#4733e6' }: {
  logoPath: string | null; name: string; size?: number; icon?: string; color?: string
}) {
  return <ServiceAvatar logoPath={logoPath} icon={icon} color={color} name={name} size={size} />
}

// DnDハンドル（grip-vertical 14px/muted・SVG 2列6点）。行左端に常時表示・cursor:grab は親側で指定。
function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

// ─── Logo Upload ──────────────────────────────────────────────────────────────

function LogoUpload({ logoPath, name, onUpload }: { logoPath: string; name: string; onUpload: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const sb = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `logos/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('service-logos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { setErr(upErr.message); return }
      const { data } = sb.storage.from('service-logos').getPublicUrl(path)
      onUpload(data.publicUrl)
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? 'アップロード失敗')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <ServiceLogo logoPath={logoPath || null} name={name || '?'} size={52} />
      <div style={{ flex: 1 }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? .6 : 1 }}>
          {uploading ? 'アップロード中…' : logoPath ? '画像を変更' : '画像を選択'}
        </button>
        {logoPath && (
          <button type="button" onClick={() => onUpload('')}
            style={{ marginLeft: 8, fontSize: '.68rem', color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            削除
          </button>
        )}
        {err && <p style={{ fontSize: '.62rem', color: 'var(--red)', marginTop: 4 }}>{err}</p>}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

// ─── Image Upload（詳細シート用イメージ画像・横長プレビュー・LogoUploadと同一storageインフラ）──
function ImageUpload({ imageUrl, onUpload }: { imageUrl: string; onUpload: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const sb = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `images/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('service-logos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { setErr(upErr.message); return }
      const { data } = sb.storage.from('service-logos').getPublicUrl(path)
      onUpload(data.publicUrl)
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? 'アップロード失敗')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      {imageUrl && (
        <img src={imageUrl} alt="" style={{ width: '100%', maxWidth: 260, height: 120, objectFit: 'cover', borderRadius: 10, marginBottom: 8, display: 'block', border: '0.5px solid var(--line)' }} />
      )}
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        style={{ fontSize: '.72rem', fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? .6 : 1 }}>
        {uploading ? 'アップロード中…' : imageUrl ? '画像を変更' : '画像を選択'}
      </button>
      {imageUrl && (
        <button type="button" onClick={() => onUpload('')}
          style={{ marginLeft: 8, fontSize: '.68rem', color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          削除
        </button>
      )}
      {err && <p style={{ fontSize: '.62rem', color: 'var(--red)', marginTop: 4 }}>{err}</p>}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}

// ─── APP live preview（ドロワー右ペイン） ──────────────────────────────────────
// svcForm/menuDrafts から表示を導出するのみ（保存経路・money計算に非接触）。
// 詳細シートは components/MenuDetailSheet を inline 描画＝APPの実物と同一コンポーネント。
// 一覧カードは refer/page.tsx の BrandCard の見た目を簡易再現（BrandCard は page 内ローカルのため import 不可）。

const noop = () => {}

// draft の先頭報酬（値が入力済みのもの）を表示用 SheetReward へ（表示整形のみ）。
function draftFirstReward(d: MenuDraft): SheetReward | null {
  const r = d.rewards.find(x => x.reward_value !== '')
  if (!r) return null
  return {
    reward_type: r.reward_type,
    reward_value: parseAmount(r.reward_value),
    reward_trigger: r.reward_trigger.trim() || null,
    default_months: r.reward_months ? parseAmount(r.reward_months) : null,
  }
}

// draft の先頭報酬の協力タスク → APPと同一の解決関数（resolveMenuCoopTasks）を通す。
function draftTasks(d: MenuDraft): CoopTaskItem[] {
  const r = d.rewards.find(x => x.reward_value !== '')
  const items: CoopTaskItem[] = (r?.tasks ?? []).map(label => ({ label, description: null }))
  return resolveMenuCoopTasks(items, r?.reward_type)
}

// 報酬ピル（refer の MenuRowPill と同一記法・共通 RewardPill/rewardValueText 再利用）。
function DraftRewardPill({ reward }: { reward: SheetReward }) {
  if (reward.reward_type === 'continuous') {
    return <RewardPill style={{ flexShrink: 0 }}><span style={{ fontWeight: 500 }}>粗利（税抜）の{Number(reward.reward_value)}%</span><span style={{ fontWeight: 400 }}>/月</span></RewardPill>
  }
  return <RewardPill style={{ flexShrink: 0 }}>{rewardValueText(reward)}</RewardPill>
}

// 一覧カード（BrandCard 展開状態の簡易再現・表示のみ）。
function PreviewCard({ svcForm, menus }: { svcForm: ServiceForm; menus: MenuDraft[] }) {
  const audience = svcForm.target_audience.trim()
  const hasBrandInfo = svcForm.description.trim().length > 0
  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--c-blue)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ServiceAvatar logoPath={svcForm.logo_path || null} icon={svcForm.icon} color={svcForm.color} name={svcForm.name || '？'} size={40} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: svcForm.name ? 'var(--txt)' : 'var(--muted)' }}>{svcForm.name || 'サービス名'}</div>
          {hasBrandInfo && (
            <span style={{ width: 16, height: 16, color: 'var(--muted)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
            </span>
          )}
          <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex', transform: 'rotate(180deg)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </div>
        {/* 静音化v2：空欄はプレビューの空白自身が語る（ヒント文なし） */}
        {audience && <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6, margin: 0 }}>{audience}</p>}
      </div>
      <div style={{ borderTop: '0.5px solid var(--line)', padding: '0 16px' }}>
        {menus.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--muted2)', padding: '13px 0', margin: 0 }}>メニューは準備中です。</p>
        ) : menus.map((d, i) => {
          const reward = draftFirstReward(d)
          const tasks = draftTasks(d)
          return (
            <div key={d.id ?? `pv-${i}`} style={{ borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', padding: '13px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name.trim() || '（無題）'}</span>
                {reward && <DraftRewardPill reward={reward} />}
                <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6" /></svg>
                </span>
              </span>
              {tasks.length > 0 && (
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tasks.map(t => <span key={t.label} style={{ fontSize: 11, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{t.label}</span>)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// プレビュー本体：一覧カード ⇄ 詳細シート。入力の度に再描画＝ライブ同期。
// 静音化v2：ヒント文なし＝空欄はプレビューの空白自身が語る。
// focus（左ナビの選択）に追従：メニュー選択中はシートが当該メニューの menu variant を映す。
function DrawerPreview({ svcForm, menuDrafts, focus }: { svcForm: ServiceForm; menuDrafts: MenuDraft[]; focus: 'basic' | number }) {
  const [mode, setMode] = useState<'card' | 'sheet'>('card')
  useEffect(() => { if (typeof focus === 'number') setMode('sheet') }, [focus])
  // プレビュー対象＝名前か報酬が入っている draft（保存対象と同じ判定）。
  const menus = menuDrafts.filter(d => d.name.trim() || d.rewards.some(r => r.reward_value))
  const selDraft = typeof focus === 'number' ? menuDrafts[focus] : undefined
  const sheetSvc = {
    name: svcForm.name || 'サービス名',
    logo_path: svcForm.logo_path || null,
    icon: svcForm.icon,
    color: svcForm.color,
    image_url: svcForm.image_url || null,
    description: svcForm.description.trim() || null,
  }
  const sheetMenus: SheetMenuItem[] = menus.map(d => ({ name: d.name.trim() || '（無題）', reward: draftFirstReward(d) }))
  const segBtn = (active: boolean): React.CSSProperties => ({ flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 500, border: `1.5px solid ${active ? 'var(--blue)' : 'var(--line)'}`, background: active ? 'var(--blue-bg2)' : '#fff', color: active ? 'var(--blue)' : 'var(--muted2)' })
  return (
    <div>
      <div style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--blue)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>APPプレビュー</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('card')} style={segBtn(mode === 'card')}>一覧カード</button>
        <button type="button" onClick={() => setMode('sheet')} style={segBtn(mode === 'sheet')}>詳細シート</button>
      </div>
      {mode === 'card' ? (
        <PreviewCard svcForm={svcForm} menus={menus} />
      ) : selDraft ? (
        <MenuDetailSheet inline svc={sheetSvc} menuName={selDraft.name.trim() || '（無題）'}
          menuDescription={selDraft.description.trim() || null}
          reward={draftFirstReward(selDraft)} tasks={draftTasks(selDraft)} onClose={noop} />
      ) : (
        <MenuDetailSheet inline variant="brand" svc={sheetSvc}
          audience={svcForm.target_audience.trim() || null} menus={sheetMenus} onClose={noop} />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type CalMember = { user_id: string; name: string | null; role: string; connected: boolean; google_email: string | null }

export default function ServicesClient({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  const [services, setServices]  = useState(initialServices)
  // 段階3a：担当メンバー候補（連携済みの owner/manager のみ）。割当UIのプルダウン用。
  const [calMembers, setCalMembers] = useState<CalMember[]>([])
  useEffect(() => {
    fetch('/api/console/calendar').then(r => r.json()).then(d => {
      if (Array.isArray(d.members)) setCalMembers((d.members as CalMember[]).filter(m => m.connected))
    }).catch(() => {})
  }, [])
  const [editing, setEditing]    = useState<ServiceWithMenus | null>(null)
  const [showAdd, setShowAdd]    = useState(false)
  // 静音化v2：3ペインの左ナビ選択（'basic'=基本情報／number=menuDrafts のインデックス）。
  const [navSel, setNavSel]      = useState<'basic' | number>('basic')
  const [svcForm, setSvcForm]    = useState<ServiceForm>(defaultServiceForm)
  const [submitting, startTrans] = useTransition()
  // 一覧v2：トーストを {msg, undo?} 型へ拡張（undo付き＝8秒表示・deals ボードと同文法）。
  const [toast, setToast]        = useState<{ msg: string; undo?: () => void } | null>(null)
  // Feature I: 供給元（サプライヤー）一覧。console専用API＝partner/vendor面の共有クエリには一切載せない（面公開禁止）。
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; rate_card?: string; brands: { id: string }[] }[]>([])
  const [rateCards, setRateCards] = useState<{ id: string; fee_model?: string }[]>([])
  useEffect(() => {
    fetch('/api/console/suppliers').then(r => r.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {})
    fetch('/api/console/rate-cards').then(r => r.json()).then(d => setRateCards(d.cards ?? [])).catch(() => {})
  }, [])
  const supplierOfBrand = (brandId: string): { id: string; name: string } | null => {
    for (const sp of suppliers) if (sp.brands.some(b => b.id === brandId)) return { id: sp.id, name: sp.name }
    return null
  }
  // Feature I-2: ブランドの供給元カードが passthrough（standard-v2）か。報酬型を「固定 or 受注額%」に絞る（サーバ側validateが正・UIは補助）。
  const brandIsPassthrough = (brandId: string): boolean => {
    const sp = suppliers.find(x => x.brands.some(b => b.id === brandId))
    if (!sp) return false
    const card = rateCards.find(c => c.id === sp.rate_card)
    return card?.fee_model === 'passthrough'
  }
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [svcError, setSvcError]  = useState('')
  // 一覧v2：ブランド行DnD（HTML5 draggable・deals/page.tsx ボードの流儀）。
  const dragBrand = useRef<number | null>(null)
  const [dragOverBrand, setDragOverBrand] = useState<number | null>(null)
  // 3ペイン左ナビ：メニューDnD（同文法）。
  const dragMenuNav = useRef<number | null>(null)
  const [dragOverMenuNav, setDragOverMenuNav] = useState<number | null>(null)
  // タスク説明（cooperation_task_templates.description・ラベル単位）：協力タスク内のインライン✎で編集。
  const [taskDescs, setTaskDescs] = useState<Record<string, string>>({})
  const [editTaskFor, setEditTaskFor] = useState<string | null>(null)   // `${mi}:${ri}:${label}`
  const [taskDescDraft, setTaskDescDraft] = useState('')

  // ── メニュー編集（確定モック menu_edit_simplified_final・draft方式・保存で一括反映） ──
  const [menuDrafts, setMenuDrafts] = useState<MenuDraft[]>([])
  const [origMenuIds, setOrigMenuIds] = useState<string[]>([])
  const [origRewardParent, setOrigRewardParent] = useState<Record<string, string>>({})  // reward_id → menu_id（削除判定）
  const [origTasks, setOrigTasks] = useState<Record<string, Tpl[]>>({})   // reward_id → 既存タスク行(削除用id)
  const setMenuField = (i: number, patch: Partial<MenuDraft>) => setMenuDrafts(p => p.map((d, j) => j === i ? { ...d, ...patch } : d))
  const setRewardField = (i: number, ri: number, patch: Partial<RewardDraft>) =>
    setMenuDrafts(p => p.map((d, j) => j === i ? { ...d, rewards: d.rewards.map((r, k) => k === ri ? { ...r, ...patch } : r) } : d))
  const addReward = (i: number) =>
    setMenuDrafts(p => p.map((d, j) => j === i ? { ...d, rewards: [...d.rewards, { id: null, reward_type: 'fixed', reward_value: '', reward_months: '', reward_trigger: '', tasks: [] }] } : d))
  const removeReward = (i: number, ri: number) =>
    setMenuDrafts(p => p.map((d, j) => j === i ? { ...d, rewards: d.rewards.filter((_, k) => k !== ri) } : d))
  const toggleRewardTask = (i: number, ri: number, label: string) =>
    setMenuDrafts(p => p.map((d, j) => j === i ? { ...d, rewards: d.rewards.map((r, k) => k === ri ? { ...r, tasks: r.tasks.includes(label) ? r.tasks.filter(l => l !== label) : [...r.tasks, label] } : r) } : d))

  // サービス編集を開いた時：menus＋報酬(menu_rewards)＋報酬単位タスクを draft に seed。
  async function loadMenuEditor(svc: ServiceWithMenus) {
    // 全タスク（reward_id 紐付け）を取得
    const td = await fetch('/api/console/task-templates').then(r => r.json()).catch(() => ({ templates: [] }))
    const tasksByReward: Record<string, Tpl[]> = {}
    const origT: Record<string, Tpl[]> = {}
    for (const t of (td.templates ?? []) as Tpl[]) if (t.reward_id) { (tasksByReward[t.reward_id] ??= []).push(t); (origT[t.reward_id] ??= []).push(t) }
    // タスク説明（ラベル単位・初出値を代表に＝旧 TaskDescriptionEditor と同じ集約）→ 協力タスクの✎編集用。
    const descs: Record<string, string> = {}
    for (const t of (td.templates ?? []) as Tpl[]) if (!(t.label in descs)) descs[t.label] = t.description ?? ''
    setTaskDescs(descs)
    const drafts: MenuDraft[] = []
    const origMids: string[] = []
    const rewardParent: Record<string, string> = {}
    for (const sm of svc.service_menus) {
      const md = await fetch(`/api/console/menus?service_menu_id=${sm.id}`).then(r => r.json()).catch(() => ({ menus: [] }))
      for (const mn of ((md.menus ?? []) as { id: string; name: string; sort: number; short_description?: string | null; description?: string | null; public_description?: string | null; calendar_member_id?: string | null }[]).sort((a, b) => a.sort - b.sort)) {
        origMids.push(mn.id)
        const rd = await fetch(`/api/console/menu-rewards?menu_id=${mn.id}`).then(r => r.json()).catch(() => ({ rewards: [] }))
        const rewards: RewardDraft[] = ((rd.rewards ?? []) as { id: string; reward_type: 'fixed' | 'rate' | 'continuous'; reward_value: number; reward_trigger: string | null; default_months: number | null }[])
          .map(r => { rewardParent[r.id] = mn.id; return { id: r.id, reward_type: r.reward_type, reward_value: String(r.reward_value ?? ''), reward_months: r.default_months != null ? String(r.default_months) : '', reward_trigger: r.reward_trigger ?? '', tasks: (tasksByReward[r.id] ?? []).map(t => t.label) } })
        drafts.push({ id: mn.id, service_menu_id: sm.id, name: mn.name, short_description: mn.short_description ?? '', description: mn.description ?? '', public_description: mn.public_description ?? '', calendar_member_id: mn.calendar_member_id ?? '', rewards })
      }
    }
    setMenuDrafts(drafts); setOrigMenuIds(origMids); setOrigRewardParent(rewardParent); setOrigTasks(origT)
  }
  function addMenuDraft() {
    const defaultSm = editing?.service_menus[0]?.id
    if (!defaultSm) { showToast('先にサービスを保存してください'); return }
    setMenuDrafts(p => [...p, { id: null, service_menu_id: defaultSm, name: '', short_description: '', description: '', public_description: '', calendar_member_id: '', rewards: [{ id: null, reward_type: 'fixed', reward_value: '', reward_months: '', reward_trigger: '', tasks: [] }] }])
    setNavSel(menuDrafts.length)   // 追加した draft を左ナビで即選択（中央＝メニュー編集・右＝シート追従）
  }
  function removeMenuDraft(i: number) {
    const d = menuDrafts[i]
    if (d.id && !confirm('このメニューを削除しますか？')) return
    setMenuDrafts(p => p.filter((_, j) => j !== i))
    setNavSel(prev => typeof prev === 'number' ? (prev === i ? 'basic' : prev > i ? prev - 1 : prev) : prev)
  }
  // 保存：draft を menus＋menu_rewards＋報酬単位タスク(reward_id)に反映。money計算式には触れない。
  // 戻り値＝反映後のメニュー（service_menu_id別・一覧の即時更新用の表示構築のみ。DBの正はサーバ）＋警告（逆ザヤ等）。
  // ★警告は途中でトースト表示しない（showToastは単一枠＝直後の「保存しました」に置換されて見えない）→収集して最終トーストに合流。
  async function reconcileMenus(): Promise<{ rebuilt: Record<string, Menu[]>; warnings: string[] }> {
    const warnSet = new Set<string>()
    const rebuilt: Record<string, Menu[]> = {}
    if (!editing) return { rebuilt, warnings: [] }
    // 一覧の即時更新用：既存メニューの sort/short_description を id で引けるように（表示のみ・保存対象外）。
    const origMenuById = new Map<string, Menu>()
    for (const sm of editing.service_menus) for (const m of (sm.menus ?? [])) origMenuById.set(m.id, m)
    const keepMenus = new Set(menuDrafts.filter(d => d.id).map(d => d.id as string))
    const keepRewards = new Set(menuDrafts.flatMap(d => d.rewards).filter(r => r.id).map(r => r.id as string))
    // 削除（メニュー＝CASCADEで報酬/タスクも消える・報酬＝CASCADEでタスクも消える）
    for (const oid of origMenuIds) if (!keepMenus.has(oid)) await fetch(`/api/console/menus/${oid}`, { method: 'DELETE' }).catch(() => {})
    for (const [rid, parentMenu] of Object.entries(origRewardParent)) if (keepMenus.has(parentMenu) && !keepRewards.has(rid)) await fetch(`/api/console/menu-rewards/${rid}`, { method: 'DELETE' }).catch(() => {})
    // メニュー upsert → 報酬 upsert → タスク同期
    for (let di = 0; di < menuDrafts.length; di++) {
      const d = menuDrafts[di]
      if (!d.name.trim() && d.rewards.every(r => !r.reward_value)) {
        // 空draftは保存スキップ（既存idを持つ場合、DB行は残る＝一覧にも従来値のまま残す）。
        // rebuilt の sort は draft順（表示構築のみ・DBのsortには書かない＝sortはユーザー操作でのみ変更）。
        if (d.id && origMenuById.has(d.id)) { const om = origMenuById.get(d.id) as Menu; (rebuilt[om.service_menu_id] ??= []).push({ ...om, sort: di }) }
        continue
      }
      const desc = d.description.trim() || null   // menus.description（詳細シート「このメニューでは」）
      const sdesc = d.short_description.trim() || null   // menus.short_description（一覧の一言説明）
      const pdesc = d.public_description.trim() || null   // menus.public_description（顧客向け相談ページ /r/）
      let menuId = d.id
      if (menuId) await fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name.trim() || '（無題）', short_description: sdesc, description: desc, public_description: pdesc }) }).catch(() => {})
      else {
        // POST /api/console/menus は name のみ受理（API変更は最小）→ description 系は POST 後に PATCH で反映。
        const res = await fetch('/api/console/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_menu_id: d.service_menu_id, name: d.name.trim() || '（無題）' }) })
        const jd = await res.json().catch(() => ({}))
        menuId = jd?.menu?.id ?? null
        if (!menuId) { showToast(`メニュー保存に失敗: ${jd?.error ?? res.status}`); continue }
        if (desc || sdesc || pdesc) await fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ short_description: sdesc, description: desc, public_description: pdesc }) }).catch(() => {})
      }
      const builtRewards: MenuReward[] = []
      for (let k = 0; k < d.rewards.length; k++) {
        const r = d.rewards[k]
        const payload = { reward_type: r.reward_type, reward_value: parseAmount(r.reward_value), reward_base: r.reward_type === 'fixed' ? null : (brandIsPassthrough(editing.id) ? '売上' : '粗利'), reward_trigger: r.reward_trigger.trim() || null, default_months: r.reward_type === 'continuous' ? (parseAmount(r.reward_months) || null) : null, sort: k }
        let rewardId = r.id
        if (rewardId) {
          const pr = await fetch(`/api/console/menu-rewards/${rewardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => null)
          const pj = pr ? await pr.json().catch(() => ({})) : {}
          if (pr && !pr.ok) showToast(`報酬保存に失敗: ${pj?.error ?? pr.status}`, { duration: 5000 })
          else if (pj?.warning) warnSet.add(String(pj.warning))
        }
        else {
          const res = await fetch('/api/console/menu-rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menu_id: menuId, ...payload }) })
          const jd = await res.json().catch(() => ({}))
          rewardId = jd?.reward?.id ?? null
          if (!rewardId) { showToast(`報酬保存に失敗: ${jd?.error ?? res.status}`, { duration: 5000 }); continue }
          if (jd?.warning) warnSet.add(String(jd.warning))
        }
        builtRewards.push({ id: rewardId, menu_id: menuId, active: true, ...payload })
        const existing = origTasks[r.id ?? ''] ?? []
        const existingLabels = new Set(existing.map(t => t.label))
        for (const mt of COOP_TASK_MASTER) {
          const want = r.tasks.includes(mt.label), have = existingLabels.has(mt.label)
          if (want && !have) await fetch('/api/console/task-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: editing.id, reward_id: rewardId, label: mt.label, kind: mt.kind, required: true, trigger_key: mt.kind === 'auto' ? 'in_progress' : null, sort: COOP_TASK_MASTER.findIndex(x => x.label === mt.label) }) }).catch(() => {})
          else if (!want && have) { const tid = existing.find(t => t.label === mt.label)?.id; if (tid) await fetch(`/api/console/task-templates/${tid}`, { method: 'DELETE' }).catch(() => {}) }
        }
      }
      ;(rebuilt[d.service_menu_id] ??= []).push({
        id: menuId, service_menu_id: d.service_menu_id, name: d.name.trim() || '（無題）', sort: di, active: true,
        calendar_member_id: d.calendar_member_id || null,
        short_description: sdesc,
        description: desc, rewards: builtRewards,
      })
    }
    return { rebuilt, warnings: [...warnSet] }
  }

  // トースト（undo付きは8秒表示・既存 showToast('文字列') 呼び出しはそのまま動く）。
  function showToast(msg: string, opts?: { undo?: () => void; duration?: number }) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, undo: opts?.undo })
    toastTimer.current = setTimeout(() => setToast(null), opts?.duration ?? 2500)
  }

  function openEdit(svc: ServiceWithMenus) {
    setSvcForm(svcToForm(svc))
    setEditing(svc); setShowAdd(false)
    setSvcError(''); setNavSel('basic')
    setMenuDrafts([]); setOrigMenuIds([]); setOrigRewardParent({}); setOrigTasks({})
    loadMenuEditor(svc).catch(() => {})   // 確定モックのメニュー編集に seed
  }

  function openAdd() {
    setSvcForm({ ...defaultServiceForm })
    setEditing(null); setShowAdd(true)
    setSvcError(''); setNavSel('basic')
    setMenuDrafts([]); setOrigMenuIds([]); setOrigRewardParent({}); setOrigTasks({})
  }

  function closeDrawer() {
    setEditing(null); setShowAdd(false); setSvcError('')
  }

  const setF = (patch: Partial<ServiceForm>) => setSvcForm(f => ({ ...f, ...patch }))

  // ── Service save ──────────────────────────────────────────────────────────
  // 編集＝サービスPATCH → reconcileMenus（メニュー＋報酬＋協力タスク一括反映）→ 一覧を即時更新して閉じる。
  // 新規＝サービスPOST → そのまま編集モードへ遷移（実装3の設計判断：最小実装として「create後にeditingへ遷移」を採用。
  //   新規でも同じドロワーの B（メニューと報酬）を続けて使える）。menus の親となる service_menus 行（バックボーン）を
  //   1行だけ作成する（旧ref/coop値は0＝一覧/APPの表示には使われない。既存 POST /services/[id]/menus を流用＝新APIなし）。
  function submitService(e: React.FormEvent | undefined) {
    e?.preventDefault?.()
    if (!svcForm.name) { setSvcError('サービス名を入力してください'); return }
    setSvcError('')
    startTrans(async () => {
      const url    = editing ? `/api/console/services/${editing.id}` : '/api/console/services'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svcFormToPayload(svcForm)) })
      if (!res.ok) { setSvcError(await res.text()); return }
      const data = await res.json()
      if (editing) {
        const { rebuilt, warnings } = await reconcileMenus()   // 確定モック：メニュー＋協力タスク紐付けを一括反映
        setServices(prev => prev.map(s => s.id === editing.id
          ? { ...s, ...data.service, service_menus: s.service_menus.map(sm => ({ ...sm, menus: rebuilt[sm.id] ?? [] })) }
          : s))
        // 逆ザヤ等の警告は「保存しました」に合流させて表示（単一枠トーストの置換で消えないように）
        showToast(warnings.length ? `保存しました ／ ⚠ ${warnings[0]}` : '保存しました', warnings.length ? { duration: 8000 } : undefined)
        closeDrawer()
      } else {
        let backbone: MenuRow | null = null
        try {
          const mres = await fetch(`/api/console/services/${data.service.id}/menus`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: svcForm.name, ref_enabled: false, ref_value: 0 }),
          })
          if (mres.ok) backbone = (await mres.json()).menu
        } catch { /* バックボーン作成に失敗してもサービスは作成済み（再度編集を開けば再試行できる） */ }
        const created: ServiceWithMenus = { ...data.service, service_menus: backbone ? [{ ...backbone, menus: [] }] : [] }
        setServices(prev => [...prev, created])
        openEdit(created)   // 作成→即メニュー追加（3ペインは編集モードのまま継続・左ナビにメニュー列が現れる）
        showToast('サービスを追加しました')
      }
    })
  }

  // ── 一覧v2：ブランド行DnD（sort のみ更新・money/中身は非接触）。表示順 = sort 昇順。 ──
  // ドロップで並びを楽観更新 → sort=index へ採番し直し、変わった行だけ PATCH（旧 moveBrand の保存作法を継承）。
  // 8秒Undoトースト：元の sort 配列を復元PATCH。sort はユーザーのドラッグ操作でのみ変更する。
  function reorderBrands(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= services.length || to >= services.length) return
    const before = services
    const arr = [...before]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    const renum = arr.map((s, idx) => ({ ...s, sort: idx }))
    const changed = renum.filter(s => (before.find(o => o.id === s.id)?.sort ?? -1) !== s.sort)
    setServices(renum)
    if (changed.length === 0) return
    for (const s of changed) fetch(`/api/console/services/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: s.sort }) }).catch(() => {})
    const prevSorts = changed.map(s => ({ id: s.id, sort: before.find(o => o.id === s.id)?.sort ?? 0 }))
    showToast('並び替えました', {
      duration: 8000,
      undo: () => {
        setServices(cur => cur
          .map(s => { const p = prevSorts.find(x => x.id === s.id); return p ? { ...s, sort: p.sort } : s })
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))
        for (const p of prevSorts) fetch(`/api/console/services/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: p.sort }) }).catch(() => {})
      },
    })
  }
  // ── 3ペイン左ナビ：メニューDnD → menus.sort へ永続化（旧 moveListMenu の保存作法を継承）。 ──
  // draft を並べ替え → sort=index で位置が変わった行のみ PATCH。services state の menus.sort も同期（表示整合）。
  // 並び順は APP（refer 一覧の展開メニュー行・登録ページ）に menus.sort 昇順でそのまま反映される。
  function reorderNavMenus(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= menuDrafts.length || to >= menuDrafts.length) return
    const before = menuDrafts
    const arr = [...before]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    setMenuDrafts(arr)
    setNavSel(prev => typeof prev === 'number' ? arr.indexOf(before[prev]) : prev)
    const sortById: Record<string, number> = {}          // 既存メニュー全行の新sort（state同期用）
    const changed: { id: string; sort: number }[] = []   // 位置が変わった既存行のみ PATCH
    arr.forEach((d, idx) => { if (d.id) { sortById[d.id] = idx; if (before.indexOf(d) !== idx) changed.push({ id: d.id, sort: idx }) } })
    for (const c of changed) fetch(`/api/console/menus/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: c.sort }) }).catch(() => {})
    if (editing) setServices(prev => prev.map(s => s.id !== editing.id ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id in sortById ? { ...m, sort: sortById[m.id] } : m) })),
    })))
  }

  // 段階3a：メニューの担当メンバーを保存（''=既定owner へ）。楽観更新＋PATCH。money非接触。
  function setMenuMember(svcId: string, menuId: string, memberId: string) {
    const val = memberId || null
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id === menuId ? { ...m, calendar_member_id: val } : m) })),
    })))
    fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar_member_id: val }) })
      .then(() => showToast('担当メンバーを保存しました')).catch(() => {})
  }
  // 段階3a：ブランド既定の担当メンバーを保存（''=既定owner へ）。
  function setBrandMember(svcId: string, memberId: string) {
    const val = memberId || null
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({ ...s, calendar_member_id: val } as ServiceWithMenus)))
    fetch(`/api/console/services/${svcId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar_member_id: val }) })
      .then(() => showToast('ブランドの担当メンバーを保存しました')).catch(() => {})
  }
  // タスク説明（ラベル単位一括・cooperation_task_templates.description）を保存。
  // 旧 TaskDescriptionEditor と同一API（PATCH /api/console/task-templates {label, description}）を流用。money非接触。
  function saveTaskDesc(label: string, description: string) {
    const v = description.trim()
    setTaskDescs(p => ({ ...p, [label]: v }))
    setEditTaskFor(null)
    fetch('/api/console/task-templates', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, description: v }) })
      .then(r => showToast(r.ok ? `「${label}」の説明を保存しました` : '保存に失敗しました')).catch(() => showToast('通信に失敗しました'))
  }

  const drawerOpen = !!editing || showAdd

  return (
    <>
      {/* ── Top bar ── */}
      <div className="console-mobile-header" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <span className="console-mobile-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500 }}>サービスマスタ</h1><PageGuide data={GUIDE_SERVICES} /></span>
        <div className="console-mobile-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip chip-direct" style={{ fontVariantNumeric: 'tabular-nums' }}>{services.length} サービス</span>
          <button onClick={openAdd} className="ui-btn ui-btn--primary" style={{ fontSize: '.76rem', padding: '8px 16px' }}>＋ サービス追加</button>
        </div>
      </div>

      {/* ── Service list v2.2（完成E）：1行1ブランド・コンパクト密度（行高40px帯・余白最小・メニューN撤去）。
             編集は3ペインに集約（行クリック＝openEdit）。行DnDで services.sort を即保存＋8秒Undo。 ── */}
      <div className="page-anim" style={{ padding: '16px 20px', maxWidth: 720 }}>
        {services.length === 0 ? (
          <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>サービスがありません</p>
        ) : (
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
            {services.map((svc, si) => {
              const category = (svc as { category?: string | null }).category ?? ''
              return (
                <div key={svc.id} draggable
                  onDragStart={() => { dragBrand.current = si }}
                  onDragOver={e => { e.preventDefault(); setDragOverBrand(si) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverBrand(null) }}
                  onDrop={e => { e.preventDefault(); setDragOverBrand(null); const f = dragBrand.current; dragBrand.current = null; if (f != null) reorderBrands(f, si) }}
                  onClick={() => openEdit(svc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer',
                    borderTop: si === 0 ? 'none' : '0.5px solid var(--line)',
                    background: dragOverBrand === si ? 'var(--blue-bg2)' : 'transparent',
                  }}>
                  <span style={{ color: 'var(--muted)', cursor: 'grab', display: 'flex', flexShrink: 0 }}><GripIcon /></span>
                  <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={28} icon={svc.icon} color={svc.color} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.name}</span>
                    {category && <span style={{ fontSize: 11, color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</span>}
                    {/* 供給元バッジは可変幅領域に置く（幅44pxの状態スパン内に入れると長い社名で行が崩れる） */}
                    {supplierOfBrand(svc.id) && <span style={{ fontSize: 11, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '2px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, flexShrink: 1 }}>供給: {supplierOfBrand(svc.id)!.name}</span>}
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, width: 44 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', boxSizing: 'border-box', flexShrink: 0, background: svc.active ? 'var(--c-blue)' : 'transparent', border: svc.active ? 'none' : '1px solid var(--muted)' }} />
                    <span style={{ fontSize: 12, color: 'var(--muted2)' }}>{svc.active ? '公開' : '停止'}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6" /></svg>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Drawer overlay ── */}
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', backdropFilter: 'blur(2px)', zIndex: 40 }}
          onClick={closeDrawer} />
      )}

      {/* ── Drawer（静音化v2・3ペイン：左ナビ132px／中央フラットフォーム／右APPライブプレビュー） ── */}
      {/* 狭幅ではプレビューを隠す（編集操作を優先） */}
      <style>{`@media (max-width: 920px) { .svc-drawer-preview { display: none } }`}</style>
      <div style={{
        position: 'fixed', right: drawerOpen ? 0 : 'calc(-1 * min(1080px, 96vw) - 60px)', top: 0, height: '100vh', width: 'min(1080px, 96vw)',
        background: '#fff', borderLeft: '0.5px solid var(--line)', boxShadow: '-8px 0 40px rgba(14,14,20,.12)',
        zIndex: 50, overflow: 'hidden', transition: 'right .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {drawerOpen && (() => {
          // 左ナビの選択 → 中央の表示対象（'basic'=基本情報／number=メニューdraft）。
          const selMenu = typeof navSel === 'number' ? menuDrafts[navSel] : undefined
          const mi = typeof navSel === 'number' ? navSel : -1
          return (
          <div key={editing?.id ?? 'new'} style={{ display: 'flex', height: '100%', position: 'relative' }}>
            <button type="button" onClick={closeDrawer} className="lift" aria-label="閉じる"
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, fontSize: '1rem', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 8, cursor: 'pointer', color: 'var(--muted2)', lineHeight: 1 }}>✕</button>

            {/* ── 左ナビ 132px：ブランド名 → 基本情報 → メニュー列 → ＋ メニュー追加（新規時は「新規」1項目） ── */}
            <nav style={{ width: 132, flexShrink: 0, borderRight: '0.5px solid var(--line)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '18px 0 14px' }}>
              {editing ? (
                <>
                  <button type="button" onClick={() => setNavSel('basic')}
                    style={{ ...navItemStyle(false), fontSize: 13, marginBottom: 8 }}>
                    {svcForm.name || '（無題）'}
                  </button>
                  <button type="button" onClick={() => setNavSel('basic')} style={navItemStyle(navSel === 'basic')}>基本情報</button>
                  {/* メニュー名列：DnDで並び替え → menus.sort へ永続化（APPの表示順に反映） */}
                  {menuDrafts.map((d, i) => (
                    <div key={d.id ?? `nav-${i}`} draggable
                      onDragStart={() => { dragMenuNav.current = i }}
                      onDragOver={e => { e.preventDefault(); setDragOverMenuNav(i) }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverMenuNav(null) }}
                      onDrop={e => { e.preventDefault(); setDragOverMenuNav(null); const f = dragMenuNav.current; dragMenuNav.current = null; if (f != null) reorderNavMenus(f, i) }}
                      style={{ display: 'flex', alignItems: 'center', flexShrink: 0, background: dragOverMenuNav === i ? 'var(--blue-bg2)' : 'transparent' }}>
                      <span style={{ color: 'var(--muted)', cursor: 'grab', display: 'flex', flexShrink: 0, paddingLeft: 6 }}><GripIcon /></span>
                      <button type="button" onClick={() => setNavSel(i)} style={{ ...navItemStyle(navSel === i), width: 'auto', flex: 1, minWidth: 0, padding: '7px 10px 7px 4px' }}>
                        {d.name.trim() || '（無題）'}
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addMenuDraft}
                    style={{ ...navItemStyle(false), color: 'var(--c-blue)', marginTop: 'auto', paddingTop: 14 }}>
                    ＋ メニュー追加
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setNavSel('basic')} style={navItemStyle(true)}>新規</button>
              )}
            </nav>

            {/* ── 中央フラットフォーム：ラベル11px/muted＋入力欄だけで縦に流す（箱なし） ── */}
            <form onSubmit={e => submitService(e)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="cascade" key={selMenu ? `menu-${mi}` : 'basic'} style={{ flex: 1, overflowY: 'auto', padding: '24px 26px 30px' }}>
                {!selMenu ? (
                  <>
                    {/* 基本情報 */}
                    <Fld label="ブランド名（必須）">
                      <FInput value={svcForm.name} onChange={v => setF({ name: v })} placeholder="MOOM" />
                    </Fld>
                    <Fld label="カテゴリ">
                      <FInput value={svcForm.category} onChange={v => setF({ category: v })} placeholder="例：不動産 / 人材 / 制作" />
                    </Fld>
                    <Fld label="説明（〜とは）">
                      <FTextarea value={svcForm.description} onChange={v => setF({ description: v })} placeholder="サービスの概要を記載" />
                    </Fld>
                    <Fld label="紹介対象（フック文）">
                      <FInput value={svcForm.target_audience} onChange={v => setF({ target_audience: v })} placeholder="例：引越し・お部屋探しをしたい人" />
                    </Fld>
                    <Fld label="こんな方に（Who）">
                      <FInput value={svcForm.who} onChange={v => setF({ who: v })} placeholder="不動産業に従事する方、物件を探している方" />
                    </Fld>
                    <Fld label="サービスサイト URL">
                      <FInput value={svcForm.url} onChange={v => setF({ url: v })} placeholder="https://example.com" />
                    </Fld>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <Fld label="ロゴ画像">
                        <div style={uploadBoxStyle}>
                          <LogoUpload logoPath={svcForm.logo_path} name={svcForm.name} onUpload={v => setF({ logo_path: v })} />
                        </div>
                      </Fld>
                      <Fld label="イメージ画像">
                        <div style={uploadBoxStyle}>
                          <ImageUpload imageUrl={svcForm.image_url} onUpload={v => setF({ image_url: v })} />
                        </div>
                      </Fld>
                    </div>
                    <Fld label="サブタイトル">
                      <FInput value={svcForm.subtitle} onChange={v => setF({ subtitle: v })} placeholder="賃貸仲介プラットフォーム" />
                    </Fld>
                    <Fld label="公開">
                      <Toggle2
                        val={svcForm.active}
                        onA={() => setF({ active: false })}
                        onB={() => setF({ active: true })}
                        labelA="停止中"
                        labelB="公開中"
                      />
                    </Fld>
                    {/* Feature I: 供給元（MB自社／サプライヤー）＝ services.supplier_partner_id 結線のUI化。即時PATCH。 */}
                    {editing && (
                      <Fld label="供給元">
                        <select
                          value={supplierOfBrand(editing.id)?.id ?? ''}
                          onChange={async e => {
                            const v = e.target.value || null
                            const r = await fetch(`/api/console/services/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supplier_partner_id: v }) })
                            if (r.ok) { showToast(v ? '供給元を結線しました（以後に確定する案件から適用）' : '供給元を解除しました'); fetch('/api/console/suppliers').then(x => x.json()).then(d => setSuppliers(d.suppliers ?? [])).catch(() => {}) }
                            else { const j = await r.json().catch(() => ({})); showToast(`供給元の変更に失敗: ${j?.error ?? r.status}`) }
                          }}
                          style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '0.5px solid var(--line)', fontSize: '.82rem', fontFamily: 'inherit', background: '#fff' }}>
                          <option value="">MB自社</option>
                          {suppliers.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                        </select>
                      </Fld>
                    )}
                    {/* 担当（ブランド既定・一覧v2でインライン担当selectをここへ移設。既存 setBrandMember 配線＝即時PATCH） */}
                    {editing && calMembers.length > 0 && (
                      <Fld label="担当">
                        <select
                          value={(services.find(s => s.id === editing.id) as { calendar_member_id?: string | null } | undefined)?.calendar_member_id ?? ''}
                          onChange={e => setBrandMember(editing.id, e.target.value)}
                          title="このブランドの商談を入れる担当メンバー（メニュー個別指定が優先）"
                          style={inputStyle}>
                          <option value="">既定（MB運営・神原勝彦）</option>
                          {calMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      </Fld>
                    )}
                  </>
                ) : (
                  <>

                    {/* メニュー編集：メニュー名／一言説明／詳細説明／報酬（枠なし）／協力タスク */}
                    <Fld label="メニュー名">
                      <input value={selMenu.name} onChange={e => setMenuField(mi, { name: e.target.value })} placeholder="メニュー名"
                        style={{ ...inputStyle, fontSize: '.84rem', fontWeight: 500 }} />
                    </Fld>
                    <Fld label="一言説明">
                      <FInput value={selMenu.short_description} onChange={v => setMenuField(mi, { short_description: v })} placeholder="例：お部屋を探している人を紹介するだけ。物件紹介はMBが対応。" />
                    </Fld>
                    <Fld label="詳細説明">
                      <FTextarea value={selMenu.description} onChange={v => setMenuField(mi, { description: v })} placeholder="例：お客さまの状況を伺い、最適なプランをご提案します" />
                    </Fld>
                    {/* 顧客向け相談ページ /r/ の説明（顧客の言葉のみ・空なら「{メニュー名}についてのご相談を承ります」を自動表示）。 */}
                    <Fld label="顧客向け説明（相談ページ）">
                      <FTextarea value={selMenu.public_description} onChange={v => setMenuField(mi, { public_description: v })} placeholder="例：お部屋探し・お住み替えのご相談を承ります。ご希望条件を伺い、最適なお部屋をご提案します。" />
                    </Fld>
                    {/* 担当（メニュー個別・一覧v2でインライン担当selectをここへ移設。既存 setMenuMember 配線＝即時PATCH） */}
                    {editing && selMenu.id && calMembers.length > 0 && (
                      <Fld label="担当">
                        <select value={selMenu.calendar_member_id}
                          onChange={e => { const v = e.target.value; setMenuField(mi, { calendar_member_id: v }); setMenuMember(editing.id, selMenu.id as string, v) }}
                          title="このメニューの商談を入れる担当メンバー"
                          style={inputStyle}>
                          <option value="">既定（ブランド担当）</option>
                          {calMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                        </select>
                      </Fld>
                    )}

                    {/* 報酬ブロック（既存エディタ・枠なし＝0.5px罫線と余白で区切る） */}
                    {selMenu.rewards.map((r, ri) => (
                      <div key={r.id ?? `nr-${ri}`} style={{ borderTop: '0.5px solid var(--line)', marginTop: 16, paddingTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>報酬{ri + 1}</span>
                          <button type="button" onClick={() => removeReward(mi, ri)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500 }}>削除</button>
                        </div>
                        {/* 報酬タイプ：固定（円）/ 粗利（%）/ 継続（毎月）。標準サプライヤー（passthrough）は固定/受注額%のみ（I-2） */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(editing && brandIsPassthrough(editing.id)
                            ? ([['fixed', '固定（円）'], ['rate', '受注額（%）']] as const)
                            : ([['fixed', '固定（円）'], ['rate', '粗利（%）'], ['continuous', '継続（毎月）']] as const)).map(([v, l]) => (
                            <button type="button" key={v} onClick={() => setRewardField(mi, ri, { reward_type: v })}
                              style={{ padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500,
                                border: `1.5px solid ${r.reward_type === v ? 'var(--c-blue)' : 'var(--line)'}`,
                                background: r.reward_type === v ? 'var(--blue-bg2)' : '#fff', color: r.reward_type === v ? 'var(--c-blue)' : 'var(--muted2)' }}>{l}</button>
                          ))}
                        </div>
                        {/* 金額/率（継続時は「毎月の率」＋「期間」） */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                          <input value={r.reward_value} onChange={e => setRewardField(mi, ri, { reward_value: e.target.value })} inputMode="numeric"
                            placeholder={r.reward_type === 'fixed' ? '30000' : '50'}
                            style={{ ...inputStyle, flex: 1, width: 'auto', fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right' }} />
                          <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500, flexShrink: 0 }}>
                            {r.reward_type === 'fixed' ? '円' : r.reward_type === 'rate' ? '%（粗利）' : '%（毎月の粗利）'}
                          </span>
                        </div>
                        {r.reward_type === 'continuous' && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', flexShrink: 0 }}>期間（デフォルト）</label>
                            <input value={r.reward_months} onChange={e => setRewardField(mi, ri, { reward_months: e.target.value })} inputMode="numeric" placeholder="12"
                              style={{ ...inputStyle, width: 80, fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right' }} />
                            <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500 }}>ヶ月</span>
                          </div>
                        )}
                        {/* トリガー */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
                          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>トリガー（成果地点）</label>
                          <input value={r.reward_trigger} onChange={e => setRewardField(mi, ri, { reward_trigger: e.target.value })} placeholder="例：賃貸成約で確定"
                            style={{ ...inputStyle, fontSize: '.76rem' }} />
                        </div>
                        {/* 協力タスク（この報酬に紐づく6マスタ選択） */}
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>協力タスク</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {COOP_TASK_MASTER.map(mt => {
                              const on = r.tasks.includes(mt.label)
                              const taskKey = `${mi}:${ri}:${mt.label}`
                              return (
                                <div key={mt.label}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', cursor: 'pointer', padding: '4px 0' }}>
                                    <input type="checkbox" checked={on} onChange={() => toggleRewardTask(mi, ri, mt.label)} style={{ accentColor: 'var(--c-blue)', width: 14, height: 14 }} />
                                    <span style={{ fontWeight: 500, color: on ? 'var(--txt)' : 'var(--muted2)' }}>{mt.label}</span>
                                    {/* タスク説明の✎（ラベル単位・登録ページのⓘに表示。旧 TaskDescriptionEditor をここへ統一） */}
                                    <button type="button" title="タスク説明を編集（登録ページのⓘに表示）"
                                      onClick={e => { e.preventDefault(); setTaskDescDraft(taskDescs[mt.label] ?? ''); setEditTaskFor(taskKey) }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>✎</button>
                                    <span style={{ flex: 1 }} />
                                    <span style={{ fontSize: '.48rem', fontWeight: 500, color: mt.kind === 'auto' ? 'var(--green)' : 'var(--muted)', background: mt.kind === 'auto' ? 'var(--green-bg)' : 'var(--bg2)', borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{mt.kind === 'auto' ? '自動検知' : '手動'}</span>
                                  </label>
                                  {editTaskFor === taskKey && (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: '2px 0 6px 22px' }}>
                                      <textarea autoFocus value={taskDescDraft} onChange={e => setTaskDescDraft(e.target.value)} rows={2}
                                        onKeyDown={e => { if (e.key === 'Escape') setEditTaskFor(null) }}
                                        placeholder="このタスクの説明（登録ページのⓘに表示）"
                                        style={{ flex: 1, minWidth: 0, border: '1px solid var(--blue)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: '.64rem', resize: 'vertical' }} />
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <button type="button" onClick={() => saveTaskDesc(mt.label, taskDescDraft)} style={{ fontSize: '.58rem', fontWeight: 500, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>保存する</button>
                                        <button type="button" onClick={() => setEditTaskFor(null)} style={{ fontSize: '.62rem', color: 'var(--muted2)', background: 'var(--bg2)', border: 'none', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* ＋ 報酬を追加／メニューを削除（テキストアクション・箱なし） */}
                    <div style={{ borderTop: '0.5px solid var(--line)', marginTop: 16, paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <button type="button" onClick={() => addReward(mi)}
                        style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                        ＋ 報酬を追加
                      </button>
                      <button type="button" onClick={() => removeMenuDraft(mi)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                        メニューを削除
                      </button>
                    </div>

                    {/* ヒアリング項目（①・保存済みメニューのみ・money非接続の記録定義） */}
                    {selMenu.id && <HearingItemsEditor menuId={selMenu.id as string} />}
                  </>
                )}

                {svcError && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 10 }}>{svcError}</p>}
              </div>

              {/* 保存（下部固定・予告文なし） */}
              <div style={{ flexShrink: 0, borderTop: '0.5px solid var(--line)', padding: '12px 26px', background: '#fff' }}>
                <button type="submit" disabled={submitting || !svcForm.name} className="ui-btn ui-btn--primary"
                  style={{ width: '100%', opacity: submitting || !svcForm.name ? .5 : 1 }}>
                  {submitting ? '保存中…' : '保存する'}
                </button>
              </div>
            </form>

            {/* ── 右ペイン：APPライブプレビュー（svcForm/menuDrafts と同期・左ナビ選択に追従） ── */}
            <aside className="svc-drawer-preview" style={{ width: 336, flexShrink: 0, borderLeft: '0.5px solid var(--line)', background: 'var(--bg2)', overflowY: 'auto', padding: '20px 18px 40px' }}>
              <DrawerPreview svcForm={svcForm} menuDrafts={menuDrafts} focus={navSel} />
            </aside>
          </div>
          )
        })()}
      </div>

      {/* ── Toast（undo付き＝8秒・「元に戻す」＝deals ボードと同文法） ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, right: 32,
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 500,
          zIndex: 130, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 8px 28px rgba(14,14,20,.18)',
        }}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={() => { const u = toast.undo; if (toastTimer.current) clearTimeout(toastTimer.current); setToast(null); u?.() }}
              style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, padding: 0 }}>
              元に戻す
            </button>
          )}
        </div>
      )}
    </>
  )
}
