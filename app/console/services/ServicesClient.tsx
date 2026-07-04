'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import ServiceAvatar from '@/components/ServiceAvatar'
import MenuDetailSheet, { type SheetMenuItem, type SheetReward } from '@/components/MenuDetailSheet'
import type { ServiceWithMenus, MenuRow, Menu, MenuReward } from '@/lib/supabase/queries'
import { parseAmount } from '@/lib/num'
import { rewardPillForMenu, rewardValueText } from '@/lib/reward-format'
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
  description: string          // menus.description（APP詳細シート「このメニューでは」）
  rewards: RewardDraft[]
}

// 協力タスクテンプレ行（cooperation_task_templates・reward_id 紐付けの読込/同期に使用）。
type Tpl = { id: string; service_id: string; menu_id: string | null; reward_id: string | null; label: string; kind: string; required: boolean; trigger_key: string | null; sort: number; active: boolean }

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

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <label style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.04em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--line)', borderRadius: 7, padding: '8px 11px',
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '.58rem', fontWeight: 500, color: 'var(--blue)', letterSpacing: '.12em',
      textTransform: 'uppercase', marginBottom: 12,
      paddingTop: 16, borderTop: '0.5px solid var(--line)', marginTop: 4,
    }}>
      {children}
    </div>
  )
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

// 並び替え用の上下ボタン（モバイルでも確実にタップできる方式）。
function ReorderBtn({ label, onClick, disabled, small }: { label: string; onClick: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label === '▲' ? '上へ移動' : '下へ移動'}
      style={{ width: small ? 18 : 24, height: small ? 14 : 16, lineHeight: 1, fontSize: small ? '.5rem' : '.58rem', border: '0.5px solid var(--line)', borderRadius: 4, background: disabled ? 'var(--bg2)' : '#fff', color: disabled ? 'var(--line)' : 'var(--muted2)', cursor: disabled ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {label}
    </button>
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

// 空フィールド → 「入力すると◯◯に表示されます」の点線ヒント。
function PreviewHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: '1px dashed var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: '.62rem', color: 'var(--muted)', lineHeight: 1.6, marginTop: 8, background: '#fff' }}>
      {children}
    </div>
  )
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
        {audience ? (
          <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6, margin: 0 }}>{audience}</p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0, border: '1px dashed var(--line)', borderRadius: 6, padding: '3px 8px' }}>紹介対象を入力するとフック文がここに表示されます</p>
        )}
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

// プレビュー本体：一覧カード ⇄ 詳細シート（事業概要／各メニュー）。入力の度に再描画＝ライブ同期。
function DrawerPreview({ svcForm, menuDrafts, isNew }: { svcForm: ServiceForm; menuDrafts: MenuDraft[]; isNew: boolean }) {
  const [mode, setMode] = useState<'card' | 'sheet'>('card')
  const [sel, setSel] = useState<number | null>(null)   // 詳細シートの対象：null=事業概要（brand）／n=メニュー
  // プレビュー対象＝名前か報酬が入っている draft（保存対象と同じ判定）。
  const menus = menuDrafts.filter(d => d.name.trim() || d.rewards.some(r => r.reward_value))
  const selDraft = sel != null ? menus[sel] : undefined
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
  const chip = (active: boolean): React.CSSProperties => ({ fontSize: '.62rem', fontWeight: 500, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${active ? 'var(--blue)' : 'var(--line)'}`, background: active ? 'var(--blue-bg2)' : '#fff', color: active ? 'var(--blue)' : 'var(--muted2)' })
  return (
    <div>
      <div style={{ fontSize: '.58rem', fontWeight: 500, color: 'var(--blue)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>APPプレビュー</div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>編集内容はパートナーAPPにこのように表示されます</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMode('card')} style={segBtn(mode === 'card')}>一覧カード</button>
        <button type="button" onClick={() => { setMode('sheet'); setSel(null) }} style={segBtn(mode === 'sheet')}>詳細シート</button>
      </div>
      {mode === 'card' ? (
        <>
          <PreviewCard svcForm={svcForm} menus={menus} />
          {!svcForm.description.trim() && <PreviewHint>事業概要ⓘは説明を入力すると表示されます</PreviewHint>}
          {menus.length === 0 && (
            <PreviewHint>{isNew ? '作成後にBでメニューと報酬を追加すると、カードに報酬つきで並びます' : 'Bでメニューと報酬を追加すると、カードに報酬つきで並びます'}</PreviewHint>
          )}
        </>
      ) : (
        <>
          {/* 詳細シートの対象：事業概要（ブランドⓘ）／各メニュー（メニュー行タップ） */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <button type="button" onClick={() => setSel(null)} style={chip(selDraft == null)}>事業概要</button>
            {menus.map((d, i) => (
              <button key={d.id ?? `sel-${i}`} type="button" onClick={() => setSel(i)} style={chip(sel === i && !!selDraft)}>{d.name.trim() || '（無題）'}</button>
            ))}
          </div>
          {selDraft ? (
            <>
              <MenuDetailSheet inline svc={sheetSvc} menuName={selDraft.name.trim() || '（無題）'}
                menuDescription={selDraft.description.trim() || null}
                reward={draftFirstReward(selDraft)} tasks={draftTasks(selDraft)} onClose={noop} />
              {!selDraft.description.trim() && <PreviewHint>「このメニューでは」はメニュー詳細説明を入力すると表示されます</PreviewHint>}
              {!draftFirstReward(selDraft)?.reward_trigger && <PreviewHint>「◯◯に確定」は報酬のトリガーを入力すると表示されます</PreviewHint>}
            </>
          ) : (
            <>
              <MenuDetailSheet inline variant="brand" svc={sheetSvc}
                audience={svcForm.target_audience.trim() || null} menus={sheetMenus} onClose={noop} />
              {!svcForm.image_url && <PreviewHint>イメージ画像を設定すると上部に表示されます（未設定はロゴ）</PreviewHint>}
              {!svcForm.description.trim() && <PreviewHint>「{svcForm.name || 'サービス名'}とは」は説明を入力すると表示されます</PreviewHint>}
              {!svcForm.target_audience.trim() && <PreviewHint>フック文は紹介対象を入力すると表示されます</PreviewHint>}
            </>
          )}
        </>
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
  const [svcForm, setSvcForm]    = useState<ServiceForm>(defaultServiceForm)
  const [submitting, startTrans] = useTransition()
  const [toast, setToast]        = useState('')
  const [svcError, setSvcError]  = useState('')
  // Wave2：一覧のインライン編集（紹介対象・一言説明・担当変更）。★表示/編集UIのみ・money非接触。
  const [editAudSvc, setEditAudSvc]     = useState<string | null>(null) // 紹介対象を編集中のブランドid
  const [audDraft, setAudDraft]         = useState('')
  const [editDescMenu, setEditDescMenu] = useState<string | null>(null) // 一言説明を編集中のメニューid
  const [descDraft, setDescDraft]       = useState('')
  const [editLongMenu, setEditLongMenu] = useState<string | null>(null) // 詳細説明(description)を編集中のメニューid
  const [longDraft, setLongDraft]       = useState('')
  const [editMemberFor, setEditMemberFor] = useState<string | null>(null) // 担当プルダウンを開いている対象キー（brand:<id> / menu:<id>）

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
    const drafts: MenuDraft[] = []
    const origMids: string[] = []
    const rewardParent: Record<string, string> = {}
    for (const sm of svc.service_menus) {
      const md = await fetch(`/api/console/menus?service_menu_id=${sm.id}`).then(r => r.json()).catch(() => ({ menus: [] }))
      for (const mn of ((md.menus ?? []) as { id: string; name: string; sort: number; description?: string | null }[]).sort((a, b) => a.sort - b.sort)) {
        origMids.push(mn.id)
        const rd = await fetch(`/api/console/menu-rewards?menu_id=${mn.id}`).then(r => r.json()).catch(() => ({ rewards: [] }))
        const rewards: RewardDraft[] = ((rd.rewards ?? []) as { id: string; reward_type: 'fixed' | 'rate' | 'continuous'; reward_value: number; reward_trigger: string | null; default_months: number | null }[])
          .map(r => { rewardParent[r.id] = mn.id; return { id: r.id, reward_type: r.reward_type, reward_value: String(r.reward_value ?? ''), reward_months: r.default_months != null ? String(r.default_months) : '', reward_trigger: r.reward_trigger ?? '', tasks: (tasksByReward[r.id] ?? []).map(t => t.label) } })
        drafts.push({ id: mn.id, service_menu_id: sm.id, name: mn.name, description: mn.description ?? '', rewards })
      }
    }
    setMenuDrafts(drafts); setOrigMenuIds(origMids); setOrigRewardParent(rewardParent); setOrigTasks(origT)
  }
  function addMenuDraft() {
    const defaultSm = editing?.service_menus[0]?.id
    if (!defaultSm) { showToast('先にサービスを保存してください'); return }
    setMenuDrafts(p => [...p, { id: null, service_menu_id: defaultSm, name: '', description: '', rewards: [{ id: null, reward_type: 'fixed', reward_value: '', reward_months: '', reward_trigger: '', tasks: [] }] }])
  }
  function removeMenuDraft(i: number) {
    const d = menuDrafts[i]
    if (d.id && !confirm('このメニューを削除しますか？')) return
    setMenuDrafts(p => p.filter((_, j) => j !== i))
  }
  // 保存：draft を menus＋menu_rewards＋報酬単位タスク(reward_id)に反映。money計算式には触れない。
  // 戻り値＝反映後のメニュー（service_menu_id別・一覧の即時更新用の表示構築のみ。DBの正はサーバ）。
  async function reconcileMenus(): Promise<Record<string, Menu[]>> {
    const rebuilt: Record<string, Menu[]> = {}
    if (!editing) return rebuilt
    // 一覧の即時更新用：既存メニューの sort/short_description を id で引けるように（表示のみ・保存対象外）。
    const origMenuById = new Map<string, Menu>()
    for (const sm of editing.service_menus) for (const m of (sm.menus ?? [])) origMenuById.set(m.id, m)
    const keepMenus = new Set(menuDrafts.filter(d => d.id).map(d => d.id as string))
    const keepRewards = new Set(menuDrafts.flatMap(d => d.rewards).filter(r => r.id).map(r => r.id as string))
    // 削除（メニュー＝CASCADEで報酬/タスクも消える・報酬＝CASCADEでタスクも消える）
    for (const oid of origMenuIds) if (!keepMenus.has(oid)) await fetch(`/api/console/menus/${oid}`, { method: 'DELETE' }).catch(() => {})
    for (const [rid, parentMenu] of Object.entries(origRewardParent)) if (keepMenus.has(parentMenu) && !keepRewards.has(rid)) await fetch(`/api/console/menu-rewards/${rid}`, { method: 'DELETE' }).catch(() => {})
    // メニュー upsert → 報酬 upsert → タスク同期
    for (const d of menuDrafts) {
      if (!d.name.trim() && d.rewards.every(r => !r.reward_value)) {
        // 空draftは保存スキップ（既存idを持つ場合、DB行は残る＝一覧にも従来値のまま残す）
        if (d.id && origMenuById.has(d.id)) { const om = origMenuById.get(d.id) as Menu; (rebuilt[om.service_menu_id] ??= []).push(om) }
        continue
      }
      const desc = d.description.trim() || null   // menus.description（詳細シート「このメニューでは」）
      let menuId = d.id
      let menuSort = menuId ? (origMenuById.get(menuId)?.sort ?? 0) : 0
      if (menuId) await fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name.trim() || '（無題）', description: desc }) }).catch(() => {})
      else {
        // POST /api/console/menus は name のみ受理（API変更は最小）→ description は POST 後に PATCH で反映。
        const res = await fetch('/api/console/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_menu_id: d.service_menu_id, name: d.name.trim() || '（無題）' }) })
        const jd = await res.json().catch(() => ({}))
        menuId = jd?.menu?.id ?? null
        if (!menuId) { showToast(`メニュー保存に失敗: ${jd?.error ?? res.status}`); continue }
        menuSort = jd?.menu?.sort ?? 0
        if (desc) await fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: desc }) }).catch(() => {})
      }
      const builtRewards: MenuReward[] = []
      for (let k = 0; k < d.rewards.length; k++) {
        const r = d.rewards[k]
        const payload = { reward_type: r.reward_type, reward_value: parseAmount(r.reward_value), reward_base: r.reward_type === 'fixed' ? null : '粗利', reward_trigger: r.reward_trigger.trim() || null, default_months: r.reward_type === 'continuous' ? (parseAmount(r.reward_months) || null) : null, sort: k }
        let rewardId = r.id
        if (rewardId) await fetch(`/api/console/menu-rewards/${rewardId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {})
        else {
          const res = await fetch('/api/console/menu-rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menu_id: menuId, ...payload }) })
          const jd = await res.json().catch(() => ({}))
          rewardId = jd?.reward?.id ?? null
          if (!rewardId) { showToast(`報酬保存に失敗: ${jd?.error ?? res.status}`); continue }
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
        id: menuId, service_menu_id: d.service_menu_id, name: d.name.trim() || '（無題）', sort: menuSort, active: true,
        calendar_member_id: d.id ? origMenuById.get(d.id)?.calendar_member_id ?? null : null,
        short_description: d.id ? origMenuById.get(d.id)?.short_description ?? null : null,
        description: desc, rewards: builtRewards,
      })
    }
    return rebuilt
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function openEdit(svc: ServiceWithMenus) {
    setSvcForm(svcToForm(svc))
    setEditing(svc); setShowAdd(false)
    setSvcError('')
    setMenuDrafts([]); setOrigMenuIds([]); setOrigRewardParent({}); setOrigTasks({})
    loadMenuEditor(svc).catch(() => {})   // 確定モックのメニュー編集に seed
  }

  function openAdd() {
    setSvcForm({ ...defaultServiceForm })
    setEditing(null); setShowAdd(true)
    setSvcError('')
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
        const rebuilt = await reconcileMenus()   // 確定モック：メニュー＋協力タスク紐付けを一括反映
        setServices(prev => prev.map(s => s.id === editing.id
          ? { ...s, ...data.service, service_menus: s.service_menus.map(sm => ({ ...sm, menus: rebuilt[sm.id] ?? [] })) }
          : s))
        showToast('保存しました — パートナー画面へ反映')
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
        openEdit(created)   // 作成→即メニュー追加（ドロワーは編集モードのまま継続）
        showToast('サービスを追加しました。続けてメニューと報酬を設定できます')
      }
    })
  }

  function toggleActive(svc: ServiceWithMenus) {
    startTrans(async () => {
      const res = await fetch(`/api/console/services/${svc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !svc.active }),
      })
      if (res.ok) {
        setServices(prev => prev.map(s => s.id === svc.id ? { ...s, active: !s.active } : s))
        showToast(svc.active ? '停止しました' : '公開しました')
      }
    })
  }

  // 並び替え（sort のみ更新・money/中身は非接触）。表示順 = sort 昇順。
  // 入れ替え後に sort=index へ採番し直し、変わった行だけ PATCH（楽観更新）。
  function moveBrand(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= services.length) return
    const arr = [...services]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    const renum = arr.map((s, idx) => ({ ...s, sort: idx }))
    const changed = renum.filter(s => (services.find(o => o.id === s.id)?.sort ?? -1) !== s.sort)
    setServices(renum)
    for (const s of changed) fetch(`/api/console/services/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: s.sort }) }).catch(() => {})
  }
  // ★リスト表示のメニュー並び替え（ドロワーの moveMenu とは別物）。
  // 以前は両方 moveMenu 同名で、関数巻き上げにより後者(ドロワー版/(mid,dir))がスコープを上書き→
  // リストの▲▼が editing=null で即return＝メニューだけ動かなかった真因。名前を分離して解消。
  function moveListMenu(svcId: string, flat: Menu[], i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= flat.length) return
    const arr = [...flat]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    const renum = arr.map((m, idx) => ({ ...m, sort: idx }))
    const sortById: Record<string, number> = {}
    for (const m of renum) sortById[m.id] = m.sort
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id in sortById ? { ...m, sort: sortById[m.id] } : m) })),
    })))
    const changed = renum.filter(m => (flat.find(o => o.id === m.id)?.sort ?? -1) !== m.sort)
    for (const m of changed) fetch(`/api/console/menus/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: m.sort }) }).catch(() => {})
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
  // 段階3a：担当メンバーidから表示名を解決（既定=null は呼び出し側で文言化）。
  const memberName = (id: string | null | undefined) => id ? (calMembers.find(m => m.user_id === id)?.name || 'メンバー') : null

  // Wave2：紹介対象(target_audience)のインライン保存。楽観更新＋services PATCH。APP STEP1と同一データ・money非接触。
  function saveBrandAudience(svcId: string, val: string) {
    const v = val.trim()
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({ ...s, target_audience: v || null } as ServiceWithMenus)))
    setEditAudSvc(null)
    fetch(`/api/console/services/${svcId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_audience: v || null }) })
      .then(() => showToast('紹介対象を保存しました')).catch(() => {})
  }
  // Wave2：一言説明(short_description)のインライン保存。楽観更新＋menus PATCH。APP STEP2と同一データ・money非接触。
  function saveMenuDesc(svcId: string, menuId: string, val: string) {
    const v = val.trim()
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id === menuId ? { ...m, short_description: v || null } : m) })),
    })))
    setEditDescMenu(null)
    fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ short_description: v || null }) })
      .then(() => showToast('一言説明を保存しました')).catch(() => {})
  }

  // menu_context v2：詳細説明(description)のインライン保存。楽観更新＋menus PATCH。APP詳細シートと同一データ・money非接触。
  function saveMenuLongDesc(svcId: string, menuId: string, val: string) {
    const v = val.trim()
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id === menuId ? { ...m, description: v || null } : m) })),
    })))
    setEditLongMenu(null)
    fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: v || null }) })
      .then(() => showToast('詳細説明を保存しました')).catch(() => {})
  }

  const drawerOpen = !!editing || showAdd

  return (
    <>
      {/* ── Top bar ── */}
      <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 500 }}>サービスマスタ</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip chip-direct" style={{ fontVariantNumeric: 'tabular-nums' }}>{services.length} サービス</span>
          <button onClick={openAdd} className="ui-btn ui-btn--primary" style={{ fontSize: '.76rem', padding: '8px 16px' }}>＋ 追加</button>
        </div>
      </div>

      {/* ── Service list ── */}
      <div className="page-anim stagger" style={{ padding: '28px', maxWidth: 860 }}>
        {services.length === 0 && <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>サービスがありません</p>}
        {services.map((svc, si) => {
          // ★一覧の「メニュー・報酬」は新 menus/menu_rewards のみを唯一のソースに統一。
          //   旧 service_menus.ref/coop（¥30,000 等の残骸）は表示しない＝APP refer と完全一致。
          //   メニュー表示は menus.sort 昇順（並び替え結果＝コンソール↔APP一致）。
          const newMenus = svc.service_menus.flatMap(sm => (sm.menus ?? [])).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
          // 段階3a：連携済みメンバーが1人以上いる時だけ割当UIを出す（いなければ全て既定owner＝従来表示）。
          const hasMembers = calMembers.length > 0
          const brandMember = (svc as { calendar_member_id?: string | null }).calendar_member_id ?? ''
          const audience = (svc as { target_audience?: string | null }).target_audience ?? ''
          return (
            <div key={svc.id} className="card-hover" style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, marginBottom: 14, padding: '18px 22px' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={44} icon={svc.icon} color={svc.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: '.9rem' }}>{svc.name}</b>
                    <span onClick={() => toggleActive(svc)} style={{
                      fontSize: '.6rem', fontWeight: 500, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                      background: svc.active ? 'var(--green-bg)' : 'var(--bg2)',
                      color: svc.active ? 'var(--green)' : 'var(--muted2)',
                    }}>
                      {svc.active ? '公開中' : '停止中'}
                    </span>
                    {/* 結果予告：この状態がAPPにどう映るか（トグルの隣・常時） */}
                    <span style={{ fontSize: '.58rem', color: 'var(--muted)', flexShrink: 0 }}>
                      {svc.active ? 'APPの紹介一覧に表示中' : '停止中はAPPに出ません'}
                    </span>
                  </div>
                  {/* 紹介対象＝商売の顔（ブランド名直下・常時表示＋インライン編集・APP STEP1と同一データ） */}
                  {editAudSvc === svc.id ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 5, alignItems: 'center' }}>
                      <input autoFocus value={audDraft} onChange={e => setAudDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveBrandAudience(svc.id, audDraft); if (e.key === 'Escape') setEditAudSvc(null) }}
                        placeholder="例：引越し・お部屋探しをしたい人"
                        style={{ flex: 1, minWidth: 0, border: '1px solid var(--blue)', borderRadius: 7, padding: '4px 9px', fontFamily: 'inherit', fontSize: '.74rem' }} />
                      <button onClick={() => saveBrandAudience(svc.id, audDraft)} style={{ fontSize: '.62rem', fontWeight: 500, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>保存する</button>
                      <button onClick={() => setEditAudSvc(null)} style={{ fontSize: '.66rem', color: 'var(--muted2)', background: 'var(--bg2)', border: 'none', borderRadius: 6, padding: '5px 9px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: '.75rem', fontWeight: 500, color: audience ? 'var(--txt)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audience || '紹介対象を設定'}</span>
                      <button onClick={() => { setAudDraft(audience); setEditAudSvc(svc.id) }} title="紹介対象を編集"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: '.66rem', color: 'var(--muted)', lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>✎</button>
                    </div>
                  )}
                  {/* カテゴリ（従属・muted）＋ブランド担当（同じ行・テキスト＋変更） */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                    {svc.subtitle && <span style={{ fontSize: '.6rem', color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{svc.subtitle}</span>}
                    {hasMembers && (editMemberFor === `brand:${svc.id}` ? (
                      <select autoFocus value={brandMember} onChange={e => { setBrandMember(svc.id, e.target.value); setEditMemberFor(null) }} onBlur={() => setEditMemberFor(null)}
                        title="このブランドの商談を入れる担当メンバー（メニュー個別指定が優先）"
                        style={{ border: '0.5px solid var(--line)', borderRadius: 7, padding: '3px 7px', fontFamily: 'inherit', fontSize: '.6rem', color: 'var(--muted2)', background: '#fff' }}>
                        <option value="">既定（MB運営・神原勝彦）</option>
                        {calMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>
                        担当：{brandMember ? memberName(brandMember) : '既定（神原勝彦）'}
                        <button onClick={() => setEditMemberFor(`brand:${svc.id}`)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '.6rem', color: 'var(--blue)', fontFamily: 'inherit', fontWeight: 500 }}>変更</button>
                      </span>
                    ))}
                  </div>
                </div>
                {/* 並び替え（上下・モバイル確実）。sortのみ更新。 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <ReorderBtn label="▲" onClick={() => moveBrand(si, -1)} disabled={si === 0} />
                  <ReorderBtn label="▼" onClick={() => moveBrand(si, 1)} disabled={si === services.length - 1} />
                </div>
                <button onClick={() => openEdit(svc)}
                  style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, flexShrink: 0 }}>
                  編集
                </button>
              </div>

              {/* ★メニュー＝価格表。新 menus/menu_rewards のみが唯一のソース（APP refer と同一）。
                 一言説明＋担当をメニュー名の下に、報酬は統一ピルで右端に。空はCTA。 */}
              {newMenus.length === 0 ? (
                <div style={{ marginTop: 12, border: '1px dashed var(--line)', borderRadius: 10, padding: '18px 14px', textAlign: 'center', background: 'var(--bg2)' }}>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500, marginBottom: 9 }}>メニューがまだありません</div>
                  <button onClick={() => openEdit(svc)} style={{ fontSize: '.7rem', fontWeight: 500, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>＋ メニューを追加</button>
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  {newMenus.map((mn, idx) => {
                    const menuMember = mn.calendar_member_id ?? ''
                    const hasReward = (mn.rewards?.length ?? 0) > 0
                    return (
                    <div key={mn.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, padding: '11px 2px', borderTop: idx === 0 ? 'none' : '0.5px solid var(--line)', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <ReorderBtn label="▲" small onClick={() => moveListMenu(svc.id, newMenus, idx, -1)} disabled={idx === 0} />
                        <ReorderBtn label="▼" small onClick={() => moveListMenu(svc.id, newMenus, idx, 1)} disabled={idx === newMenus.length - 1} />
                      </div>
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: '.76rem', fontWeight: 500, color: 'var(--txt)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mn.name}</span>
                        {/* 一言説明（名前の下・muted・1行省略＋インライン編集・APP STEP2と同一データ） */}
                        {editDescMenu === mn.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveMenuDesc(svc.id, mn.id, descDraft); if (e.key === 'Escape') setEditDescMenu(null) }}
                              placeholder="例：お部屋を探している人を紹介するだけ。物件紹介はMBが対応。"
                              style={{ flex: 1, minWidth: 0, border: '1px solid var(--blue)', borderRadius: 6, padding: '3px 8px', fontFamily: 'inherit', fontSize: '.64rem' }} />
                            <button onClick={() => saveMenuDesc(svc.id, mn.id, descDraft)} style={{ fontSize: '.58rem', fontWeight: 500, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>保存する</button>
                            <button onClick={() => setEditDescMenu(null)} style={{ fontSize: '.62rem', color: 'var(--muted2)', background: 'var(--bg2)', border: 'none', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{ fontSize: '.64rem', color: mn.short_description ? 'var(--muted2)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mn.short_description || '一言説明を設定'}</span>
                            <button onClick={() => { setDescDraft(mn.short_description ?? ''); setEditDescMenu(mn.id) }} title="一言説明を編集"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>✎</button>
                          </div>
                        )}
                        {/* 詳細説明（description・詳細シート「このメニューでは」に表示・複数行インライン編集） */}
                        {editLongMenu === mn.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <textarea autoFocus value={longDraft} onChange={e => setLongDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Escape') setEditLongMenu(null) }}
                              placeholder="例：このメニューでは、お客さまの状況を伺い最適なプランをご提案します。"
                              rows={3}
                              style={{ flex: 1, minWidth: 0, border: '1px solid var(--blue)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: '.64rem', resize: 'vertical' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <button onClick={() => saveMenuLongDesc(svc.id, mn.id, longDraft)} style={{ fontSize: '.58rem', fontWeight: 500, color: '#fff', background: 'var(--blue)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>保存する</button>
                              <button onClick={() => setEditLongMenu(null)} style={{ fontSize: '.62rem', color: 'var(--muted2)', background: 'var(--bg2)', border: 'none', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <span style={{ fontSize: '.62rem', color: (mn as { description?: string | null }).description ? 'var(--muted2)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(mn as { description?: string | null }).description ? '詳細説明あり' : '詳細説明を設定'}</span>
                            <button onClick={() => { setLongDraft((mn as { description?: string | null }).description ?? ''); setEditLongMenu(mn.id) }} title="詳細説明を編集"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1, fontFamily: 'inherit', flexShrink: 0 }}>✎</button>
                          </div>
                        )}
                        {/* 担当（テキスト＋変更→プルダウン。連携済メンバーがいる時のみ＝段階3aゲート維持） */}
                        {hasMembers && (editMemberFor === `menu:${mn.id}` ? (
                          <select autoFocus value={menuMember} onChange={e => { setMenuMember(svc.id, mn.id, e.target.value); setEditMemberFor(null) }} onBlur={() => setEditMemberFor(null)}
                            title="このメニューの商談を入れる担当メンバー"
                            style={{ maxWidth: 240, border: '0.5px solid var(--line)', borderRadius: 7, padding: '3px 7px', fontFamily: 'inherit', fontSize: '.6rem', color: 'var(--muted2)', background: '#fff' }}>
                            <option value="">既定（{brandMember ? 'ブランド担当' : 'MB運営・神原勝彦'}）</option>
                            {calMembers.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>
                            担当：{menuMember ? memberName(menuMember) : '既定'}
                            <button onClick={() => setEditMemberFor(`menu:${mn.id}`)} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '.6rem', color: 'var(--blue)', fontFamily: 'inherit', fontWeight: 500 }}>変更</button>
                          </span>
                        ))}
                      </div>
                      {/* 統一報酬ピル（bg-accent・999px・APPと同一記法・menu_rewards から表示整形のみ） */}
                      <span style={{ justifySelf: 'end', display: 'inline-block', fontFamily: 'Inter', fontSize: '.68rem', fontWeight: 500, whiteSpace: 'nowrap', borderRadius: 999, padding: '4px 12px', background: hasReward ? 'var(--blue-bg2)' : 'var(--bg2)', color: hasReward ? 'var(--blue)' : 'var(--muted)' }}>
                        {rewardPillForMenu(mn.rewards ?? [])}
                      </span>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Drawer overlay ── */}
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', backdropFilter: 'blur(2px)', zIndex: 40 }}
          onClick={closeDrawer} />
      )}

      {/* ── Drawer（2ペイン：左=編集フォーム／右=APPライブプレビュー） ── */}
      {/* 狭幅ではプレビューを隠す（編集操作を優先） */}
      <style>{`@media (max-width: 760px) { .svc-drawer-preview { display: none } }`}</style>
      <div style={{
        position: 'fixed', right: drawerOpen ? 0 : 'calc(-1 * min(880px, 94vw) - 60px)', top: 0, height: '100vh', width: 'min(880px, 94vw)',
        background: '#fff', borderLeft: '0.5px solid var(--line)', boxShadow: '-8px 0 40px rgba(14,14,20,.12)',
        zIndex: 50, overflow: 'hidden', transition: 'right .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {drawerOpen && (
          <div key={editing?.id ?? 'new'} style={{ display: 'flex', height: '100%' }}>
          <form onSubmit={e => submitService(e)} className="cascade" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 26px 88px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h2 style={{ fontSize: '.92rem', fontWeight: 500 }}>
                {editing ? 'サービスを編集' : '新しいサービス'}
              </h2>
              <button type="button" onClick={closeDrawer} className="lift"
                style={{ fontSize: '1rem', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--muted2)', lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>

            {/* ── A. 基本情報 ── */}
            <SectionLabel>A. 基本情報</SectionLabel>

            <Fld label="ロゴ画像（推奨・APPの紹介一覧カードと詳細シートに表示）">
              <LogoUpload logoPath={svcForm.logo_path} name={svcForm.name} onUpload={v => setF({ logo_path: v })} />
            </Fld>

            <Fld label="イメージ画像（任意・APPの詳細シート上部に表示・未設定はロゴ）">
              <ImageUpload imageUrl={svcForm.image_url} onUpload={v => setF({ image_url: v })} />
            </Fld>

            <Fld label="サービス名（必須）">
              <FInput value={svcForm.name} onChange={v => setF({ name: v })} placeholder="MOOM" />
            </Fld>

            <Fld label="サブタイトル">
              <FInput value={svcForm.subtitle} onChange={v => setF({ subtitle: v })} placeholder="賃貸仲介プラットフォーム" />
            </Fld>

            <Fld label="紹介対象（APPの紹介一覧カードでフック文として表示）">
              <FInput value={svcForm.target_audience} onChange={v => setF({ target_audience: v })} placeholder="例：引越し・お部屋探しをしたい人" />
            </Fld>

            <Fld label="カテゴリ（任意・APPの紹介一覧の絞り込みチップに使用）">
              <FInput value={svcForm.category} onChange={v => setF({ category: v })} placeholder="例：不動産 / 人材 / 制作" />
            </Fld>

            <Fld label="サービスサイト URL">
              <FInput value={svcForm.url} onChange={v => setF({ url: v })} placeholder="https://example.com" />
            </Fld>

            <Fld label="説明（APPの事業概要ⓘと詳細シート「◯◯とは」に表示）">
              <FTextarea value={svcForm.description} onChange={v => setF({ description: v })} placeholder="サービスの概要を記載" />
            </Fld>

            <Fld label="こんな方に（Who）">
              <FInput value={svcForm.who} onChange={v => setF({ who: v })} placeholder="不動産業に従事する方、物件を探している方" />
            </Fld>

            {/* ── B. メニューと報酬（確定モック menu_edit_reward_with_trigger_tasks_console・メニュー＞報酬複数） ── */}
            <SectionLabel>B. メニューと報酬</SectionLabel>
            {!editing && (
              <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '0 0 12px', lineHeight: 1.6 }}>
                サービスを作成すると、続けてこの画面でメニューと報酬を追加できます
              </p>
            )}
            {editing && (
              <>

                {menuDrafts.map((d, i) => (
                  <div key={d.id ?? `new-${i}`} style={{ border: '0.5px solid var(--line)', borderRadius: 12, padding: '14px 14px', marginBottom: 12, background: '#fff' }}>
                    {/* メニュー名 ＋ メニュー削除 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <input value={d.name} onChange={e => setMenuField(i, { name: e.target.value })} placeholder="メニュー名"
                        style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.84rem', fontWeight: 500 }} />
                      <button type="button" onClick={() => removeMenuDraft(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 500, padding: '8px 2px', flexShrink: 0, whiteSpace: 'nowrap' }}>メニューを削除</button>
                    </div>

                    {/* メニュー詳細説明（menus.description）＝APP詳細シート「このメニューでは」。
                        一覧のインライン✎編集と同一データ（ドロワーが正の編集口・プレビュー連動） */}
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>メニュー詳細説明（任意・APPの詳細シート「このメニューでは」に表示）</label>
                      <textarea value={d.description} onChange={e => setMenuField(i, { description: e.target.value })} rows={3}
                        placeholder="例：お客さまの状況を伺い、最適なプランをご提案します"
                        style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', resize: 'vertical', background: '#fff' }} />
                    </div>

                    {/* 報酬ブロック（複数） */}
                    {d.rewards.map((r, ri) => (
                      <div key={r.id ?? `nr-${ri}`} style={{ marginTop: 12, border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '12px 12px', background: 'var(--blue-bg2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--blue-dk)' }}>報酬{ri + 1}</span>
                          <button type="button" onClick={() => removeReward(i, ri)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 500 }}>削除</button>
                        </div>
                        {/* 報酬タイプ：固定（円）/ 粗利（%）/ 継続（毎月）の3択 */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {([['fixed', '固定（円）'], ['rate', '粗利（%）'], ['continuous', '継続（毎月）']] as const).map(([v, l]) => (
                            <button type="button" key={v} onClick={() => setRewardField(i, ri, { reward_type: v })}
                              style={{ padding: '8px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 500,
                                background: r.reward_type === v ? 'var(--c-blue)' : '#fff', color: r.reward_type === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
                          ))}
                        </div>
                        {/* 金額/率（継続時は「毎月の率」＋「期間」） */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                          <input value={r.reward_value} onChange={e => setRewardField(i, ri, { reward_value: e.target.value })} inputMode="numeric"
                            placeholder={r.reward_type === 'fixed' ? '30000' : '50'}
                            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right', background: '#fff' }} />
                          <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500, flexShrink: 0 }}>
                            {r.reward_type === 'fixed' ? '円' : r.reward_type === 'rate' ? '%（粗利）' : '%（毎月の粗利）'}
                          </span>
                        </div>
                        {r.reward_type === 'continuous' && (
                          <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                              <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', flexShrink: 0 }}>期間（デフォルト）</label>
                              <input value={r.reward_months} onChange={e => setRewardField(i, ri, { reward_months: e.target.value })} inputMode="numeric"
                                placeholder="12"
                                style={{ width: 80, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right', background: '#fff' }} />
                              <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500 }}>ヶ月</span>
                            </div>
                          </>
                        )}
                        {/* トリガー */}
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>トリガー（成果地点）</label>
                          <input value={r.reward_trigger} onChange={e => setRewardField(i, ri, { reward_trigger: e.target.value })} placeholder="例：賃貸成約で確定"
                            style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', boxSizing: 'border-box', background: '#fff' }} />
                        </div>
                        {/* 協力タスク（この報酬で必要なもの） */}
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>協力タスク（この報酬で必要なものを選ぶ）</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {COOP_TASK_MASTER.map(mt => {
                              const on = r.tasks.includes(mt.label)
                              return (
                                <label key={mt.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', cursor: 'pointer', padding: '4px 0' }}>
                                  <input type="checkbox" checked={on} onChange={() => toggleRewardTask(i, ri, mt.label)} style={{ accentColor: 'var(--c-blue)', width: 14, height: 14 }} />
                                  <span style={{ flex: 1, fontWeight: 500, color: on ? 'var(--txt)' : 'var(--muted2)' }}>{mt.label}</span>
                                  <span style={{ fontSize: '.48rem', fontWeight: 500, color: mt.kind === 'auto' ? 'var(--green)' : 'var(--muted)', background: mt.kind === 'auto' ? 'var(--green-bg)' : 'var(--bg2)', borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{mt.kind === 'auto' ? '自動検知' : '手動'}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* ＋報酬を追加 */}
                    <button type="button" onClick={() => addReward(i)}
                      style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1.5px dashed var(--blue)', background: '#fff', color: 'var(--blue)', fontSize: '.7rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 }}>
                      ＋ 報酬を追加
                    </button>
                  </div>
                ))}

                {/* ＋ メニューを追加（破線） */}
                <button type="button" onClick={addMenuDraft}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: '1.5px dashed var(--c-blue)', background: 'var(--blue-bg2)', color: 'var(--c-blue)', fontSize: '.78rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
                  ＋ メニューを追加
                </button>
              </>
            )}

            {/* ── C. 公開状態 ── */}
            <SectionLabel>C. 公開状態</SectionLabel>
            <Fld label="公開状態">
              <Toggle2
                val={svcForm.active}
                onA={() => setF({ active: false })}
                onB={() => setF({ active: true })}
                labelA="停止中"
                labelB="公開中"
              />
            </Fld>
            <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '-6px 0 0', lineHeight: 1.6 }}>
              停止するとAPPの紹介一覧から非表示になります
            </p>

            {svcError && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 8 }}>{svcError}</p>}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="submit" disabled={submitting || !svcForm.name} className="ui-btn ui-btn--primary"
                style={{ width: '100%', opacity: submitting || !svcForm.name ? .5 : 1 }}>
                {submitting ? '保存中…' : editing ? '保存してパートナー画面へ反映' : '作成してパートナー画面へ公開'}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }} />
              </button>
              {/* 結果予告：保存がどこに映るか（1行） */}
              <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: 0, textAlign: 'center' }}>
                保存するとAPPの紹介一覧・詳細シートに即時反映されます
              </p>
            </div>
          </form>

          {/* ── 右ペイン：APPライブプレビュー（svcForm/menuDrafts と同期） ── */}
          <aside className="svc-drawer-preview" style={{ width: 336, flexShrink: 0, borderLeft: '0.5px solid var(--line)', background: 'var(--bg2)', overflowY: 'auto', padding: '20px 18px 40px' }}>
            <DrawerPreview svcForm={svcForm} menuDrafts={menuDrafts} isNew={!editing} />
          </aside>
          </div>
        )}
      </div>

      {/* ── Toast ── */}
      <div style={{
        position: 'fixed', bottom: 32, right: 32,
        transform: `translateY(${toast ? 0 : 16}px)`,
        background: 'var(--txt)', color: '#fff', padding: '12px 22px',
        borderRadius: 9, fontSize: '.74rem', fontWeight: 500,
        opacity: toast ? 1 : 0, pointerEvents: 'none',
        transition: 'all .28s', zIndex: 130, whiteSpace: 'nowrap',
        boxShadow: '0 8px 28px rgba(14,14,20,.18)',
      }}>
        {toast}
      </div>
    </>
  )
}
