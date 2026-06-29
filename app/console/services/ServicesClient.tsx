'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import ServiceAvatar from '@/components/ServiceAvatar'
import { SectionHeader } from '@/components/ui/Header'
import type { ServiceWithMenus, MenuRow, Menu } from '@/lib/supabase/queries'
import { parseAmount } from '@/lib/num'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_OPTIONS = ['売上', '粗利', '利益', '受取収入']
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
// ⑤ 協力報酬の料率基準は粗利に一本化（新規/編集で選べるのは粗利のみ）。
// 既存メニューの coop_base 値（売上/利益等）は再編集しない限り保持＝後方互換。coop_base は非money（reward=base_amount×value/100）。
const COOP_BASE_OPTIONS = ['粗利']

const COVERAGE_DEFAULTS = [
  { label: 'つなぐ',             included: true  },
  { label: 'アポイント設定',     included: false },
  { label: '商談',               included: false },
  { label: '価格合意',           included: false },
  { label: 'フォロー・アシスト', included: false },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type CoverageStep = { label: string; included: boolean }

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
  rewards: RewardDraft[]
}

// 協力はメニュー単位（service_menus.coop_*）に一本化。サービス単位 coop_* は廃止。
type ServiceForm = {
  name: string; subtitle: string; description: string; who: string; url: string
  logo_path: string; active: boolean
  icon: string; color: string  // kept for backward compat, not shown in UI
}

const defaultServiceForm: ServiceForm = {
  name: '', subtitle: '', description: '', who: '', url: '', logo_path: '',
  active: true, icon: 'arrows', color: '#4733e6',
}

type MenuForm = {
  name: string
  ref_enabled: boolean
  ref_type: 'fixed' | 'rate'
  ref_value: string
  ref_base: string
  ref_trigger: string
  coverage_steps: CoverageStep[]
  qualification: string
  ref_months: string
  // ── 協力（per-menu cooperation） ──
  coop_enabled: boolean
  coop_type: 'fixed' | 'rate'
  coop_value: string
  coop_base: string
  coop_coverage: CoverageStep[]
  coop_condition: string
}

const defaultMenuForm: MenuForm = {
  name: '', ref_enabled: true, ref_type: 'fixed', ref_value: '', ref_base: '', ref_trigger: '',
  coverage_steps: COVERAGE_DEFAULTS.map(s => ({ ...s })),
  qualification: '',
  ref_months: '',
  coop_enabled: false, coop_type: 'rate', coop_value: '', coop_base: '粗利',
  coop_coverage: COVERAGE_DEFAULTS.map(s => ({ ...s })),
  coop_condition: '',
}

function menuToForm(m: MenuRow): MenuForm {
  const mm = m as MenuRow & {
    ref_enabled?: boolean | null
    coop_enabled?: boolean | null
    coop_type?: 'fixed' | 'rate' | null
    coop_value?: number | null
    coop_base?: string | null
    coop_coverage?: CoverageStep[] | null
    coop_condition?: string | null
  }
  return {
    name:           m.name,
    ref_enabled:    mm.ref_enabled ?? true,
    ref_type:       m.ref_type,
    ref_value:      String(m.ref_value ?? ''),
    ref_base:       m.ref_base ?? '',
    ref_trigger:    m.ref_trigger ?? '',
    coverage_steps: Array.isArray(m.coverage_steps) && m.coverage_steps.length === 5
                    ? m.coverage_steps
                    : COVERAGE_DEFAULTS.map(s => ({ ...s })),
    qualification:  m.qualification ?? '',
    ref_months:     m.ref_months && m.ref_months > 1 ? String(m.ref_months) : '',
    coop_enabled:   mm.coop_enabled ?? false,
    coop_type:      mm.coop_type ?? 'rate',
    coop_value:     mm.coop_value != null ? String(mm.coop_value) : '',
    coop_base:      mm.coop_base ?? '',
    coop_coverage:  Array.isArray(mm.coop_coverage) && mm.coop_coverage.length === 5
                    ? mm.coop_coverage
                    : COVERAGE_DEFAULTS.map(s => ({ ...s })),
    coop_condition: mm.coop_condition ?? '',
  }
}

function formToMenuPayload(f: MenuForm) {
  return {
    name:           f.name,
    ref_enabled:    f.ref_enabled,
    ref_type:       f.ref_type,
    ref_value:      f.ref_value ? Number(f.ref_value) : 0,
    ref_base:       f.ref_type === 'rate' ? (f.ref_base || null) : null,
    ref_trigger:    f.ref_trigger || null,
    coverage_steps: f.coverage_steps,
    qualification:  f.qualification || null,
    ref_months:     f.ref_months ? Number(f.ref_months) : null,
    // ── 協力（per-menu cooperation） ──
    coop_enabled:   f.coop_enabled,
    coop_type:      f.coop_enabled ? f.coop_type : null,
    coop_value:     f.coop_enabled && f.coop_value ? Number(f.coop_value) : null,
    coop_base:      f.coop_enabled ? (f.coop_base || null) : null,
    coop_coverage:  f.coop_enabled ? f.coop_coverage : null,
    coop_condition: f.coop_enabled ? (f.coop_condition || null) : null,
  }
}

function svcFormToPayload(f: ServiceForm) {
  return {
    name:           f.name,
    subtitle:       f.subtitle       || null,
    description:    f.description    || null,
    who:            f.who            || null,
    url:            f.url            || null,
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
      <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em' }}>{label}</label>
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

function FSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: { v: string | number; l: string }[]; placeholder?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '.58rem', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.12em',
      textTransform: 'uppercase', marginBottom: 12,
      paddingTop: 16, borderTop: '1px solid var(--line)', marginTop: 4,
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
          flex: 1, padding: '8px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700,
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
      style={{ width: small ? 18 : 24, height: small ? 14 : 16, lineHeight: 1, fontSize: small ? '.5rem' : '.58rem', border: '1px solid var(--line)', borderRadius: 4, background: disabled ? 'var(--bg2)' : '#fff', color: disabled ? 'var(--line)' : 'var(--muted2)', cursor: disabled ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? .6 : 1 }}>
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

// ─── Coverage steps editor ────────────────────────────────────────────────────

function CoverageEditor({ steps, onChange }: {
  steps: CoverageStep[]
  onChange: (steps: CoverageStep[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {steps.map((step, i) => (
        <label key={step.label} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 7,
          border: `1.5px solid ${step.included ? 'var(--txt)' : 'var(--line)'}`,
          background: step.included ? '#F0F0F4' : '#fff',
          cursor: i === 0 ? 'default' : 'pointer',
        }}>
          <input type="checkbox" checked={step.included} disabled={i === 0}
            onChange={e => {
              if (i === 0) return
              onChange(steps.map((s, j) => j === i ? { ...s, included: e.target.checked } : s))
            }}
            style={{ accentColor: 'var(--txt)', width: 14, height: 14 }} />
          <span style={{ fontSize: '.78rem', fontWeight: i === 0 ? 700 : 500, color: step.included ? 'var(--txt)' : 'var(--muted2)' }}>
            {step.label}
            {i === 0 && <span style={{ fontSize: '.58rem', marginLeft: 5, opacity: .55 }}>必須</span>}
          </span>
        </label>
      ))}
    </div>
  )
}

// ─── Coverage tags (display only) ─────────────────────────────────────────────

export function CoverageTags({ steps, accent = false }: {
  steps: { label: string; included: boolean }[] | null
  accent?: boolean
}) {
  if (!steps) return null
  const included = steps.filter(s => s.included)
  if (included.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {included.map(s => (
        <span key={s.label} style={{
          fontSize: '.54rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10,
          background: accent ? 'var(--blue-bg)' : '#EBEBF0',
          color: accent ? 'var(--blue)' : 'var(--txt)',
        }}>{s.label}</span>
      ))}
    </div>
  )
}

// ─── Referral menu inline edit form ──────────────────────────────────────────

// Header for a reward block (紹介 / 協力) with chip + enable toggle.
function RewardBlockHead({ chip, title, val, onToggle }: {
  chip: React.ReactNode; title: string; val: boolean; onToggle: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {chip}
      <span style={{ flex: 1, fontSize: '.74rem', fontWeight: 800, color: 'var(--txt)' }}>{title}</span>
      <div style={{ width: 132, marginBottom: -12 }}>
        <Toggle2 val={val} onA={() => onToggle(false)} onB={() => onToggle(true)} labelA="なし" labelB="あり" />
      </div>
    </div>
  )
}

// Segmented type selector (固定額 / 率) — accent: blue for 紹介, dark for 協力.
function TypeSeg({ value, onChange, accent }: {
  value: 'fixed' | 'rate'; onChange: (t: 'fixed' | 'rate') => void; accent: 'blue' | 'dark'
}) {
  const on  = accent === 'blue' ? 'var(--blue)' : 'var(--txt)'
  const bg  = accent === 'blue' ? 'var(--blue-bg2)' : '#F0F0F4'
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {(['fixed', 'rate'] as const).map(t => (
        <button key={t} type="button" onClick={() => onChange(t)}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700,
            border: `1.5px solid ${value === t ? on : 'var(--line)'}`,
            background: value === t ? bg : '#fff',
            color: value === t ? on : 'var(--muted2)',
          }}>
          {t === 'fixed' ? '固定額（円）' : '率（%）'}
        </button>
      ))}
    </div>
  )
}

function MenuEditForm({ form, onChange, onSave, onCancel, saving, error }: {
  form: MenuForm; onChange: (f: MenuForm) => void
  onSave: () => void; onCancel: () => void; saving: boolean; error: string
}) {
  const f = form
  const set = (patch: Partial<MenuForm>) => onChange({ ...f, ...patch })

  return (
    <div style={{ background: '#fff', border: '1.5px solid var(--blue)', borderRadius: 12, padding: 16, marginBottom: 8, boxShadow: '0 4px 16px rgba(71,51,230,.08)' }}>

      {/* BR-C3: 論理セクションを明示（①基本 ②紹介報酬 ③協力報酬）。各報酬ブロックに 対応範囲/任意条件 を内包。保存契約は不変。 */}
      <SectionHeader title="① 基本" style={{ marginBottom: 8 }} />
      <Fld label="メニュー名 *">
        <FInput value={f.name} onChange={v => set({ name: v })} placeholder="例: 賃貸成約時" />
      </Fld>

      {/* 段階6-2b：旧②③（紹介報酬/協力報酬の2セクション編集）は撤去。報酬は「D. メニュー（1報酬）」で設定。
          旧 service_menus の ref/coop 系カラムは read-only 凍結（既存値はそのまま保持・新規には書かれない・DROPはしない）。 */}
      <div style={{ marginTop: 12, padding: '11px 13px', background: 'var(--blue-bg2)', border: '1px dashed var(--blue-bg)', borderRadius: 10, fontSize: '.66rem', color: 'var(--blue-dk)', lineHeight: 1.6 }}>
        報酬は下の<b>「D. メニュー（1報酬）」</b>で設定します（固定◯円 or 粗利◯%・任意数）。旧「紹介報酬／協力報酬」の2区分は廃止しました。
      </div>

      {error && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--muted2)', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          キャンセル
        </button>
        <button type="button" onClick={onSave} disabled={saving || !f.name}
          style={{ flex: 2, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: '.74rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !f.name ? .5 : 1, fontFamily: 'inherit' }}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ─── Chips ────────────────────────────────────────────────────────────────────

// Compact reward chip for the service list summary（是正2：区分語ラベルなし・報酬のみ）。
function RewardChip({ kind, text }: { kind: 'ref' | 'coop'; text: string }) {
  const ref = kind === 'ref'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums',
      background: ref ? 'var(--blue-bg)' : '#EBEBF0',
      color: ref ? 'var(--blue)' : 'var(--txt)',
    }}>
      {text}
    </span>
  )
}

function fmtRef(menu: MenuRow) {
  return menu.ref_type === 'fixed'
    ? `¥${Number(menu.ref_value).toLocaleString()}`
    : `${menu.ref_value}%${menu.ref_base ? `・${menu.ref_base}` : ''}`
}

function Btn2({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: '.6rem', fontWeight: 700, padding: '4px 8px', borderRadius: 5,
      border: '1px solid var(--line)', background: danger ? '#FBE9E9' : '#fff',
      color: danger ? 'var(--red)' : 'var(--muted2)', cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type CalAccount = { id: string; account_label: string; google_email: string | null; active: boolean; is_default: boolean }

export default function ServicesClient({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  const [services, setServices]  = useState(initialServices)
  // 段階B：担当カレンダーアカウント一覧（mb_calendars＋既定）。割当UIのプルダウン用。
  const [calAccounts, setCalAccounts] = useState<CalAccount[]>([])
  useEffect(() => {
    fetch('/api/console/calendar').then(r => r.json()).then(d => { if (Array.isArray(d.accounts)) setCalAccounts(d.accounts) }).catch(() => {})
  }, [])
  const [editing, setEditing]    = useState<ServiceWithMenus | null>(null)
  const [showAdd, setShowAdd]    = useState(false)
  const [svcForm, setSvcForm]    = useState<ServiceForm>(defaultServiceForm)
  const [submitting, startTrans] = useTransition()
  const [toast, setToast]        = useState('')
  const [svcError, setSvcError]  = useState('')

  const [menuEditId, setMenuEditId] = useState<string | null>(null)
  const [menuForm, setMenuForm]     = useState<MenuForm>(defaultMenuForm)
  const [menuSaving, setMenuSaving] = useState(false)
  const [menuError, setMenuError]   = useState('')
  const [liveMenus, setLiveMenus]   = useState<MenuRow[]>([])

  // 段階5：新「メニュー（1報酬）」CRUD。service_menu_id ごとに menus 行を管理（旧②③は併走温存）。
  const [menuRows, setMenuRows] = useState<Record<string, Menu[]>>({})
  const [nmParent, setNmParent] = useState<string | null>(null)   // 追加対象 service_menu_id
  const [nmName, setNmName] = useState('')
  const [nmType, setNmType] = useState<'fixed' | 'rate'>('fixed')
  const [nmValue, setNmValue] = useState('')
  const [nmTrigger, setNmTrigger] = useState('')
  const [mnBusy, setMnBusy] = useState(false)
  async function loadMenus(ids: string[]) {
    const entries = await Promise.all(ids.map(async smId => {
      const d = await fetch(`/api/console/menus?service_menu_id=${smId}`).then(r => r.json()).catch(() => ({ menus: [] }))
      return [smId, (d.menus ?? []) as Menu[]] as const
    }))
    setMenuRows(Object.fromEntries(entries))
  }
  async function addMenu(serviceMenuId: string) {
    if (!nmName.trim()) return
    setMnBusy(true)
    try {
      const body = { service_menu_id: serviceMenuId, name: nmName.trim(), reward_type: nmType, reward_value: Number(nmValue) || 0, reward_base: nmType === 'rate' ? '粗利' : null, reward_trigger: nmTrigger || null, sort: (menuRows[serviceMenuId]?.length ?? 0) }
      const r = await fetch('/api/console/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.menu) { await loadMenus(liveMenus.map(m => m.id)); setNmName(''); setNmValue(''); setNmTrigger(''); setNmParent(null) }
      else showToast(d.error ?? '追加に失敗しました')
    } finally { setMnBusy(false) }
  }
  async function patchMenu(id: string, patch: Record<string, unknown>) {
    const r = await fetch(`/api/console/menus/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    if (r.ok) await loadMenus(liveMenus.map(m => m.id)); else { const d = await r.json().catch(() => ({})); showToast(d.error ?? '更新に失敗しました') }
  }
  async function delMenu(id: string) {
    if (!confirm('このメニューを削除しますか？')) return
    const r = await fetch(`/api/console/menus/${id}`, { method: 'DELETE' })
    if (r.ok) await loadMenus(liveMenus.map(m => m.id)); else { const d = await r.json().catch(() => ({})); showToast(d.error ?? '削除に失敗しました') }
  }

  // 是正：協力タスクをメニュー単位で設定（cooperation_task_templates.menu_id=該当 menus.id）。
  // 既存 task-templates API を menu_id 付きで再利用。メニューごとに固有タスク（menu_id分離）。
  const [menuTasks, setMenuTasks] = useState<Record<string, Tpl[]>>({})   // menus.id → tasks
  const [mtLabel, setMtLabel] = useState<Record<string, string>>({})       // menus.id → 入力中ラベル
  async function loadMenuTasks() {
    const d = await fetch('/api/console/task-templates').then(r => r.json()).catch(() => ({ templates: [] }))
    const byMenu: Record<string, Tpl[]> = {}
    for (const t of (d.templates ?? []) as Tpl[]) if (t.menu_id) { (byMenu[t.menu_id] ??= []).push(t) }
    for (const k of Object.keys(byMenu)) byMenu[k].sort((a, b) => a.sort - b.sort)
    setMenuTasks(byMenu)
  }
  async function addMenuTask(serviceId: string, menuId: string) {
    const label = (mtLabel[menuId] ?? '').trim()
    if (!label) return
    const r = await fetch('/api/console/task-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: serviceId, menu_id: menuId, label, kind: 'manual', required: true, sort: (menuTasks[menuId]?.length ?? 0) }) })
    const d = await r.json()
    if (d.template) { await loadMenuTasks(); setMtLabel(p => ({ ...p, [menuId]: '' })) }
    else showToast(d.needsMigration ? 'タスクのDB適用が必要です' : (d.error ?? '追加に失敗しました'))
  }
  async function delMenuTask(id: string) {
    const r = await fetch(`/api/console/task-templates/${id}`, { method: 'DELETE' })
    if (r.ok) await loadMenuTasks(); else showToast('削除に失敗しました')
  }
  // 6マスタのチェック切替：未選択→作成（menu_id紐付け）／選択済→削除。
  async function toggleMasterTask(serviceId: string, menuId: string, m: { label: string; kind: 'auto' | 'manual' }) {
    const existing = (menuTasks[menuId] ?? []).find(t => t.label === m.label)
    if (existing) { await delMenuTask(existing.id); return }
    const r = await fetch('/api/console/task-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: serviceId, menu_id: menuId, label: m.label, kind: m.kind, required: true, trigger_key: m.kind === 'auto' ? 'in_progress' : null, sort: COOP_TASK_MASTER.findIndex(x => x.label === m.label) }) })
    const d = await r.json()
    if (d.template) await loadMenuTasks(); else showToast(d.needsMigration ? 'タスクのDB適用が必要です' : (d.error ?? '追加に失敗しました'))
  }

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
      for (const mn of ((md.menus ?? []) as { id: string; name: string; sort: number }[]).sort((a, b) => a.sort - b.sort)) {
        origMids.push(mn.id)
        const rd = await fetch(`/api/console/menu-rewards?menu_id=${mn.id}`).then(r => r.json()).catch(() => ({ rewards: [] }))
        const rewards: RewardDraft[] = ((rd.rewards ?? []) as { id: string; reward_type: 'fixed' | 'rate' | 'continuous'; reward_value: number; reward_trigger: string | null; default_months: number | null }[])
          .map(r => { rewardParent[r.id] = mn.id; return { id: r.id, reward_type: r.reward_type, reward_value: String(r.reward_value ?? ''), reward_months: r.default_months != null ? String(r.default_months) : '', reward_trigger: r.reward_trigger ?? '', tasks: (tasksByReward[r.id] ?? []).map(t => t.label) } })
        drafts.push({ id: mn.id, service_menu_id: sm.id, name: mn.name, rewards })
      }
    }
    setMenuDrafts(drafts); setOrigMenuIds(origMids); setOrigRewardParent(rewardParent); setOrigTasks(origT)
  }
  function addMenuDraft() {
    const defaultSm = editing?.service_menus[0]?.id
    if (!defaultSm) { showToast('先にサービスを保存してください'); return }
    setMenuDrafts(p => [...p, { id: null, service_menu_id: defaultSm, name: '', rewards: [{ id: null, reward_type: 'fixed', reward_value: '', reward_months: '', reward_trigger: '', tasks: [] }] }])
  }
  function removeMenuDraft(i: number) {
    const d = menuDrafts[i]
    if (d.id && !confirm('このメニューを削除しますか？')) return
    setMenuDrafts(p => p.filter((_, j) => j !== i))
  }
  // 保存：draft を menus＋menu_rewards＋報酬単位タスク(reward_id)に反映。money計算式には触れない。
  async function reconcileMenus() {
    if (!editing) return
    const keepMenus = new Set(menuDrafts.filter(d => d.id).map(d => d.id as string))
    const keepRewards = new Set(menuDrafts.flatMap(d => d.rewards).filter(r => r.id).map(r => r.id as string))
    // 削除（メニュー＝CASCADEで報酬/タスクも消える・報酬＝CASCADEでタスクも消える）
    for (const oid of origMenuIds) if (!keepMenus.has(oid)) await fetch(`/api/console/menus/${oid}`, { method: 'DELETE' }).catch(() => {})
    for (const [rid, parentMenu] of Object.entries(origRewardParent)) if (keepMenus.has(parentMenu) && !keepRewards.has(rid)) await fetch(`/api/console/menu-rewards/${rid}`, { method: 'DELETE' }).catch(() => {})
    // メニュー upsert → 報酬 upsert → タスク同期
    for (const d of menuDrafts) {
      if (!d.name.trim() && d.rewards.every(r => !r.reward_value)) continue
      let menuId = d.id
      if (menuId) await fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: d.name.trim() || '（無題）' }) }).catch(() => {})
      else {
        const res = await fetch('/api/console/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_menu_id: d.service_menu_id, name: d.name.trim() || '（無題）' }) })
        const jd = await res.json().catch(() => ({}))
        menuId = jd?.menu?.id ?? null
        if (!menuId) { showToast(`メニュー保存に失敗: ${jd?.error ?? res.status}`); continue }
      }
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
        const existing = origTasks[r.id ?? ''] ?? []
        const existingLabels = new Set(existing.map(t => t.label))
        for (const mt of COOP_TASK_MASTER) {
          const want = r.tasks.includes(mt.label), have = existingLabels.has(mt.label)
          if (want && !have) await fetch('/api/console/task-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: editing.id, reward_id: rewardId, label: mt.label, kind: mt.kind, required: true, trigger_key: mt.kind === 'auto' ? 'in_progress' : null, sort: COOP_TASK_MASTER.findIndex(x => x.label === mt.label) }) }).catch(() => {})
          else if (!want && have) { const tid = existing.find(t => t.label === mt.label)?.id; if (tid) await fetch(`/api/console/task-templates/${tid}`, { method: 'DELETE' }).catch(() => {}) }
        }
      }
    }
  }

  // Batch2: 追加ドロワー（新規作成時のみ）の「最初のメニュー（任意）」インライン入力。
  const [addMenuName, setAddMenuName] = useState('')
  const [addRefValue, setAddRefValue] = useState('') // 紹介報酬（固定額・円）
  const [addCoopPct, setAddCoopPct]   = useState('') // 協力報酬（粗利の%・基準は粗利固定＝Batch1⑤準拠）

  // C. 対応範囲（協力タスク）= cooperation_task_templates。サービス編集に統合（旧 /console/tasks）。
  type Tpl = { id: string; service_id: string; menu_id: string | null; reward_id: string | null; label: string; kind: string; required: boolean; trigger_key: string | null; sort: number; active: boolean }
  const [taskTpls, setTaskTpls] = useState<Tpl[]>([])
  const [tLabel, setTLabel] = useState('')
  const [tKind, setTKind] = useState<'manual' | 'auto'>('manual')
  const [tRequired, setTRequired] = useState(true)
  const [tTrigger, setTTrigger] = useState('')
  const [tBusy, setTBusy] = useState(false)
  const selSm: React.CSSProperties = { border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit', fontSize: '.7rem', background: '#fff' }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  async function addTask() {
    if (!editing || !tLabel.trim()) return
    setTBusy(true)
    try {
      const r = await fetch('/api/console/task-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: editing.id, label: tLabel.trim(), kind: tKind, required: tRequired, trigger_key: tKind === 'auto' ? (tTrigger || null) : null, sort: taskTpls.length }) })
      const d = await r.json()
      if (d.template) { setTaskTpls(p => [...p, d.template]); setTLabel(''); setTTrigger('') }
      else showToast(d.needsMigration ? '協力タスクのDB適用が必要です（batchP DDL）' : (d.error ?? '追加に失敗しました'))
    } finally { setTBusy(false) }
  }
  async function patchTask(id: string, body: Partial<Tpl>) {
    const r = await fetch(`/api/console/task-templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json(); if (d.template) setTaskTpls(p => p.map(t => t.id === id ? d.template : t))
  }
  async function delTask(id: string) {
    if (!confirm('この対応項目を削除しますか？')) return
    const r = await fetch(`/api/console/task-templates/${id}`, { method: 'DELETE' })
    if (r.ok) setTaskTpls(p => p.filter(t => t.id !== id))
  }

  function openEdit(svc: ServiceWithMenus) {
    setSvcForm(svcToForm(svc))
    setEditing(svc); setShowAdd(false)
    setLiveMenus([...svc.service_menus].sort((a, b) => a.sort - b.sort))
    setMenuEditId(null); setSvcError('')
    // 対応範囲（協力タスク）を読み込み（best-effort）
    setTaskTpls([]); setTLabel(''); setTTrigger('')
    fetch('/api/console/task-templates').then(r => r.json()).then(d => setTaskTpls((d.templates ?? []).filter((t: Tpl) => t.service_id === svc.id))).catch(() => {})
    // 段階5：新メニュー(1報酬)を seed（attachMenus 由来）＋最新を再取得
    const seed: Record<string, Menu[]> = {}
    for (const sm of svc.service_menus) seed[sm.id] = (sm.menus ?? [])
    setMenuRows(seed); setNmParent(null); setNmName(''); setNmValue(''); setNmTrigger('')
    setMenuTasks({}); setMtLabel({})
    setMenuDrafts([]); setOrigMenuIds([]); setOrigRewardParent({}); setOrigTasks({})
    loadMenuEditor(svc).catch(() => {})   // 確定モックのメニュー編集に seed
  }

  function openAdd() {
    setSvcForm({ ...defaultServiceForm })
    setEditing(null); setShowAdd(true)
    setLiveMenus([]); setMenuEditId(null); setSvcError('')
    setAddMenuName(''); setAddRefValue(''); setAddCoopPct('')
  }

  function closeDrawer() {
    setEditing(null); setShowAdd(false); setMenuEditId(null); setSvcError('')
    setAddMenuName(''); setAddRefValue(''); setAddCoopPct('')
  }

  const setF = (patch: Partial<ServiceForm>) => setSvcForm(f => ({ ...f, ...patch }))

  // ── Service save ──────────────────────────────────────────────────────────
  // Batch2: 新規作成時は withMenu=true で「最初のメニュー（任意）」も同時作成（報酬入力がある時のみ）。
  // 「名前だけで作る」は withMenu=false。編集時(editing)は従来どおり（インラインメニューは無関係）。
  function submitService(e: React.FormEvent | undefined, withMenu: boolean) {
    e?.preventDefault?.()
    if (!svcForm.name) { setSvcError('サービス名を入力してください'); return }
    // インラインメニューの軽い検証（新規・withMenu・報酬入力時のみ）。
    if (!editing && withMenu) {
      if (addRefValue && !(parseAmount(addRefValue) > 0)) { setSvcError('固定報酬（円）は0より大きい数値で入力してください'); return }
      if (addCoopPct && !(parseAmount(addCoopPct) > 0 && parseAmount(addCoopPct) <= 100)) { setSvcError('報酬（粗利の%）は 0〜100 で入力してください'); return }
    }
    setSvcError('')
    startTrans(async () => {
      const url    = editing ? `/api/console/services/${editing.id}` : '/api/console/services'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svcFormToPayload(svcForm)) })
      if (!res.ok) { setSvcError(await res.text()); return }
      const data = await res.json()
      if (editing) {
        await reconcileMenus()   // 確定モック：メニュー＋協力タスク紐付けを一括反映
        setServices(prev => prev.map(s => s.id === editing.id ? { ...s, ...data.service, service_menus: liveMenus } : s))
        showToast('保存しました — パートナー画面へ反映')
      } else {
        // 最初のメニュー（任意）：報酬入力があれば1メニューを同時作成（紹介=固定額 / 協力=rate・基準=粗利）。
        let createdMenus: MenuRow[] = []
        const hasReward = !!addRefValue || !!addCoopPct
        if (withMenu && hasReward) {
          const payload = {
            name:           addMenuName.trim() || svcForm.name,
            ref_enabled:    !!addRefValue,
            ref_type:       'fixed',
            ref_value:      addRefValue ? parseAmount(addRefValue) : 0,
            ref_base:       null,
            ref_trigger:    null,
            coverage_steps: null,
            qualification:  null,
            ref_months:     null,
            coop_enabled:   !!addCoopPct,
            coop_type:      addCoopPct ? 'rate' : null,
            coop_value:     addCoopPct ? parseAmount(addCoopPct) : null,
            coop_base:      addCoopPct ? '粗利' : null,
            coop_coverage:  null,
            coop_condition: null,
          }
          try {
            const mres = await fetch(`/api/console/services/${data.service.id}/menus`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            })
            if (mres.ok) { const { menu } = await mres.json(); createdMenus = [menu] }
          } catch { /* メニュー作成失敗してもサービスは作成済み（後から編集で追加可） */ }
        }
        setServices(prev => [...prev, { ...data.service, service_menus: createdMenus }])
        showToast(createdMenus.length ? 'サービスとメニューを追加しました' : 'サービスを追加しました')
      }
      closeDrawer()
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

  // 段階B：メニューの担当カレンダーアカウントを保存（''=既定へ）。楽観更新＋PATCH。money非接触。
  function setMenuAccount(svcId: string, menuId: string, accountId: string) {
    const val = accountId || null
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({
      ...s,
      service_menus: s.service_menus.map(sm => ({ ...sm, menus: (sm.menus ?? []).map(m => m.id === menuId ? { ...m, calendar_account_id: val } : m) })),
    })))
    fetch(`/api/console/menus/${menuId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar_account_id: val }) })
      .then(() => showToast('担当カレンダーを保存しました')).catch(() => {})
  }
  // 段階B：ブランド既定の担当カレンダーアカウントを保存（''=既定へ）。
  function setBrandAccount(svcId: string, accountId: string) {
    const val = accountId || null
    setServices(prev => prev.map(s => s.id !== svcId ? s : ({ ...s, calendar_account_id: val } as ServiceWithMenus)))
    fetch(`/api/console/services/${svcId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ calendar_account_id: val }) })
      .then(() => showToast('ブランドの担当カレンダーを保存しました')).catch(() => {})
  }

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  function startAddMenu() {
    setMenuForm({ ...defaultMenuForm, coverage_steps: COVERAGE_DEFAULTS.map(s => ({ ...s })) })
    setMenuEditId('new'); setMenuError('')
  }
  function startEditMenu(m: MenuRow) { setMenuForm(menuToForm(m)); setMenuEditId(m.id); setMenuError('') }

  async function saveMenu() {
    if (!menuForm.name) { setMenuError('メニュー名を入力してください'); return }
    if (!menuForm.ref_enabled && !menuForm.coop_enabled) {
      setMenuError('報酬を設定してください'); return
    }
    if (menuForm.ref_enabled && menuForm.ref_type === 'rate') {
      const v = Number(menuForm.ref_value)
      if (!v || v <= 0 || v > 100) { setMenuError('率は 0〜100% の範囲で入力してください'); return }
      if (!menuForm.ref_base) { setMenuError('率タイプでは基準を選択してください'); return }
    }
    if (menuForm.coop_enabled && menuForm.coop_type === 'rate') {
      const v = Number(menuForm.coop_value)
      if (!v || v <= 0 || v > 100) { setMenuError('料率は 0〜100% の範囲で入力してください'); return }
      if (!menuForm.coop_base) { setMenuError('料率では基準を選択してください'); return }
    }
    if (!editing) return
    setMenuSaving(true); setMenuError('')
    try {
      const payload = formToMenuPayload(menuForm)
      if (menuEditId === 'new') {
        const res = await fetch(`/api/console/services/${editing.id}/menus`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) { setMenuError(await res.text()); return }
        const { menu } = await res.json()
        setLiveMenus(prev => [...prev, menu])
        showToast('メニューを追加しました')
      } else {
        const res = await fetch(`/api/console/services/${editing.id}/menus/${menuEditId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) { setMenuError(await res.text()); return }
        const { menu } = await res.json()
        setLiveMenus(prev => prev.map(m => m.id === menuEditId ? menu : m))
        showToast('メニューを更新しました')
      }
      setMenuEditId(null)
    } finally { setMenuSaving(false) }
  }

  async function deleteMenu(mid: string) {
    if (!editing || !confirm('このメニューを削除しますか?')) return
    const res = await fetch(`/api/console/services/${editing.id}/menus/${mid}`, { method: 'DELETE' })
    if (res.ok) { setLiveMenus(prev => prev.filter(m => m.id !== mid)); showToast('削除しました') }
  }

  async function moveMenu(mid: string, dir: -1 | 1) {
    if (!editing) return
    const idx = liveMenus.findIndex(m => m.id === mid)
    if (idx < 0) return
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= liveMenus.length) return
    const next = [...liveMenus]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    const updated = next.map((m, i) => ({ ...m, sort: i }))
    setLiveMenus(updated)
    await Promise.all([
      fetch(`/api/console/services/${editing.id}/menus/${updated[idx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: updated[idx].sort }) }),
      fetch(`/api/console/services/${editing.id}/menus/${updated[swapIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: updated[swapIdx].sort }) }),
    ])
  }

  const drawerOpen = !!editing || showAdd

  return (
    <>
      {/* ── Top bar ── */}
      <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>サービスマスタ</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip chip-direct" style={{ fontVariantNumeric: 'tabular-nums' }}>{services.length} サービス</span>
          <button onClick={openAdd} className="btn btn-p" style={{ fontSize: '.76rem', padding: '8px 16px' }}>＋ 追加</button>
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
          // 段階B：追加アカウントが1つ以上ある時だけ割当UIを出す（無ければ全て既定＝従来表示）。
          const hasExtraAccounts = calAccounts.some(a => !a.is_default)
          const brandAcc = (svc as { calendar_account_id?: string | null }).calendar_account_id ?? ''
          return (
            <div key={svc.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, marginBottom: 14, padding: '18px 22px' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={44} icon={svc.icon} color={svc.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: '.9rem' }}>{svc.name}</b>
                    <span onClick={() => toggleActive(svc)} style={{
                      fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer', flexShrink: 0,
                      background: svc.active ? 'var(--green-bg)' : 'var(--bg2)',
                      color: svc.active ? 'var(--green)' : 'var(--muted2)',
                    }}>
                      {svc.active ? '公開中' : '停止中'}
                    </span>
                  </div>
                  {svc.subtitle && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{svc.subtitle}</div>}
                </div>
                {/* 並び替え（上下・モバイル確実）。sortのみ更新。 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <ReorderBtn label="▲" onClick={() => moveBrand(si, -1)} disabled={si === 0} />
                  <ReorderBtn label="▼" onClick={() => moveBrand(si, 1)} disabled={si === services.length - 1} />
                </div>
                <button onClick={() => openEdit(svc)}
                  style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, flexShrink: 0 }}>
                  編集
                </button>
              </div>

              {/* 段階B：ブランド既定の担当カレンダー（追加アカウントがある時のみ。メニュー未指定はここに従う） */}
              {hasExtraAccounts && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)' }}>ブランド既定カレンダー</span>
                  <select
                    value={brandAcc}
                    onChange={e => setBrandAccount(svc.id, e.target.value)}
                    title="このブランドの商談を入れる既定カレンダー（メニュー個別指定が優先）"
                    style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '5px 9px', fontFamily: 'inherit', fontSize: '.66rem', color: 'var(--muted2)', background: '#fff' }}
                  >
                    <option value="">📅 既定（MB運営）</option>
                    {calAccounts.filter(a => !a.is_default).map(a => <option key={a.id} value={a.id}>📅 {a.account_label}</option>)}
                  </select>
                </div>
              )}

              {/* ★メニュー＝価格表。新 menus/menu_rewards のみが唯一のソース（APP refer と同一）。
                 空なら旧残骸を出さず「メニュー未登録」。各行＝menus.name ＋ menu_rewards（固定¥/粗利%）。 */}
              {newMenus.length === 0 ? (
                <div style={{ marginTop: 12, border: '1px dashed var(--line)', borderRadius: 10, padding: '14px', textAlign: 'center', background: 'var(--bg2)' }}>
                  <span style={{ fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 600 }}>メニュー未登録（「編集」からメニュー＞報酬を作成）</span>
                </div>
              ) : (
                <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '7px 14px', background: 'var(--bg2)', alignItems: 'center' }}>
                    <span style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>メニュー</span>
                    <span style={{ textAlign: 'right', fontSize: '.54rem', fontWeight: 700, color: 'var(--muted2)' }}>報酬</span>
                  </div>
                  {newMenus.map((mn, idx) => (
                    <div key={mn.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, padding: '10px 14px', borderTop: idx === 0 ? 'none' : '1px solid #F2F2F6', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <ReorderBtn label="▲" small onClick={() => moveListMenu(svc.id, newMenus, idx, -1)} disabled={idx === 0} />
                        <ReorderBtn label="▼" small onClick={() => moveListMenu(svc.id, newMenus, idx, 1)} disabled={idx === newMenus.length - 1} />
                      </div>
                      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: '.74rem', fontWeight: 600, color: 'var(--txt)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mn.name}</span>
                        {hasExtraAccounts && (
                          <select
                            value={mn.calendar_account_id ?? ''}
                            onChange={e => setMenuAccount(svc.id, mn.id, e.target.value)}
                            title="このメニューの商談を入れるカレンダー"
                            style={{ maxWidth: 220, border: '1px solid var(--line)', borderRadius: 7, padding: '4px 8px', fontFamily: 'inherit', fontSize: '.64rem', color: 'var(--muted2)', background: '#fff' }}
                          >
                            <option value="">📅 既定（{svc.calendar_account_id ? 'ブランド設定' : 'MB運営'}）</option>
                            {calAccounts.filter(a => !a.is_default).map(a => <option key={a.id} value={a.id}>📅 {a.account_label}</option>)}
                          </select>
                        )}
                      </div>
                      <span className="tnum" style={{ textAlign: 'right', fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 700, color: (mn.rewards?.length ?? 0) > 0 ? 'var(--txt)' : 'var(--muted)' }}>
                        {(mn.rewards ?? []).map(r => r.reward_type === 'fixed' ? `¥${Number(r.reward_value).toLocaleString()}` : r.reward_type === 'continuous' ? `継続 ${r.reward_value}%/月${r.default_months ? `・${r.default_months}ヶ月` : ''}` : `${r.reward_value}%${r.reward_base ? `・${r.reward_base}` : ''}`).join(' / ') || '報酬未設定'}
                      </span>
                    </div>
                  ))}
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

      {/* ── Drawer ── */}
      <div style={{
        position: 'fixed', right: drawerOpen ? 0 : '-520px', top: 0, height: '100vh', width: 500,
        background: '#fff', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 40px rgba(14,14,20,.12)',
        zIndex: 50, overflowY: 'auto', transition: 'right .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {drawerOpen && (
          <form key={editing?.id ?? 'new'} onSubmit={e => submitService(e, true)} className="cascade" style={{ padding: '24px 26px 88px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h2 style={{ fontSize: '.92rem', fontWeight: 900 }}>
                {editing ? 'サービスを編集' : '新しいサービス'}
              </h2>
              <button type="button" onClick={closeDrawer} className="lift"
                style={{ fontSize: '1rem', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--muted2)', lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>

            {/* ── A. 基本情報 ── */}
            <SectionLabel>A. 基本情報</SectionLabel>

            <Fld label="ロゴ画像（推奨）">
              <LogoUpload logoPath={svcForm.logo_path} name={svcForm.name} onUpload={v => setF({ logo_path: v })} />
            </Fld>

            <Fld label="サービス名 *">
              <FInput value={svcForm.name} onChange={v => setF({ name: v })} placeholder="MOOM" />
            </Fld>

            <Fld label="サブタイトル">
              <FInput value={svcForm.subtitle} onChange={v => setF({ subtitle: v })} placeholder="賃貸仲介プラットフォーム" />
            </Fld>

            <Fld label="サービスサイト URL">
              <FInput value={svcForm.url} onChange={v => setF({ url: v })} placeholder="https://example.com" />
            </Fld>

            <Fld label="説明">
              <FTextarea value={svcForm.description} onChange={v => setF({ description: v })} placeholder="サービスの概要を記載" />
            </Fld>

            <Fld label="こんな方に（Who）">
              <FInput value={svcForm.who} onChange={v => setF({ who: v })} placeholder="不動産業に従事する方、物件を探している方" />
            </Fld>

            <Fld label="公開状態">
              <Toggle2
                val={svcForm.active}
                onA={() => setF({ active: false })}
                onB={() => setF({ active: true })}
                labelA="停止中"
                labelB="公開中"
              />
            </Fld>

            {/* B撤去：メニュー編集は下の確定モック単一セクションに統合（旧UIは描画しない） */}
            {false && (
              <>
                <SectionLabel>B. メニューと報酬</SectionLabel>

                {liveMenus.map((menu, i, arr) => (
                  <div key={menu.id}>
                    {menuEditId === menu.id ? (
                      <MenuEditForm
                        form={menuForm} onChange={setMenuForm}
                        onSave={saveMenu} onCancel={() => setMenuEditId(null)}
                        saving={menuSaving} error={menuError}
                      />
                    ) : (
                      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                          <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{menu.name}</span>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {i > 0 && <Btn2 label="↑" onClick={() => moveMenu(menu.id, -1)} />}
                            {i < arr.length - 1 && <Btn2 label="↓" onClick={() => moveMenu(menu.id, 1)} />}
                            <Btn2 label="編集" onClick={() => startEditMenu(menu)} />
                            <Btn2 label="削除" onClick={() => deleteMenu(menu.id)} danger />
                          </div>
                        </div>
                        {(() => {
                          const mm = menu as MenuRow & {
                            ref_enabled?: boolean | null
                            coop_enabled?: boolean | null; coop_type?: 'fixed' | 'rate' | null
                            coop_value?: number | null; coop_base?: string | null
                          }
                          const showRef  = (mm.ref_enabled ?? true)
                          const showCoop = mm.coop_enabled && mm.coop_value != null
                          const coopText = mm.coop_type === 'fixed'
                            ? `¥${Number(mm.coop_value).toLocaleString()}`
                            : `${mm.coop_value}%${mm.coop_base ? `・${mm.coop_base}` : ''}`
                          return (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 12px 10px' }}>
                              {showRef && <RewardChip kind="ref" text={fmtRef(menu)} />}
                              {showCoop && <RewardChip kind="coop" text={coopText} />}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                ))}

                {menuEditId === 'new' ? (
                  <MenuEditForm
                    form={menuForm} onChange={setMenuForm}
                    onSave={saveMenu} onCancel={() => setMenuEditId(null)}
                    saving={menuSaving} error={menuError}
                  />
                ) : (
                  <button type="button" onClick={startAddMenu}
                    style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1.5px dashed var(--blue)', background: 'var(--blue-bg2)', color: 'var(--blue)', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
                    ＋ メニューを追加
                  </button>
                )}
              </>
            )}

            {/* ── メニュー（確定モック menu_edit_reward_with_trigger_tasks_console・メニュー＞報酬複数） ── */}
            {editing && (
              <>
                <SectionLabel>メニュー</SectionLabel>

                {menuDrafts.map((d, i) => (
                  <div key={d.id ?? `new-${i}`} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '14px 14px', marginBottom: 12, background: '#fff' }}>
                    {/* メニュー名 ＋ メニュー削除 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <input value={d.name} onChange={e => setMenuField(i, { name: e.target.value })} placeholder="メニュー名"
                        style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'inherit', fontSize: '.84rem', fontWeight: 700 }} />
                      <button type="button" onClick={() => removeMenuDraft(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.66rem', fontWeight: 700, padding: '8px 2px', flexShrink: 0, whiteSpace: 'nowrap' }}>メニューを削除</button>
                    </div>

                    {/* 報酬ブロック（複数） */}
                    {d.rewards.map((r, ri) => (
                      <div key={r.id ?? `nr-${ri}`} style={{ marginTop: 12, border: '1px solid var(--blue-bg)', borderRadius: 10, padding: '12px 12px', background: 'var(--blue-bg2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--blue-dk)' }}>報酬{ri + 1}</span>
                          <button type="button" onClick={() => removeReward(i, ri)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 700 }}>削除</button>
                        </div>
                        {/* 報酬タイプ：固定（円）/ 粗利（%）/ 継続（毎月）の3択 */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {([['fixed', '固定（円）'], ['rate', '粗利（%）'], ['continuous', '継続（毎月）']] as const).map(([v, l]) => (
                            <button type="button" key={v} onClick={() => setRewardField(i, ri, { reward_type: v })}
                              style={{ padding: '8px 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.7rem', fontWeight: 700,
                                background: r.reward_type === v ? 'var(--c-blue)' : '#fff', color: r.reward_type === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
                          ))}
                        </div>
                        {/* 金額/率（継続時は「毎月の率」＋「期間」） */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                          <input value={r.reward_value} onChange={e => setRewardField(i, ri, { reward_value: e.target.value })} inputMode="numeric"
                            placeholder={r.reward_type === 'fixed' ? '30000' : '50'}
                            style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right', background: '#fff' }} />
                          <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 700, flexShrink: 0 }}>
                            {r.reward_type === 'fixed' ? '円' : r.reward_type === 'rate' ? '%（粗利）' : '%（毎月の粗利）'}
                          </span>
                        </div>
                        {r.reward_type === 'continuous' && (
                          <>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                              <label style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', flexShrink: 0 }}>期間（デフォルト）</label>
                              <input value={r.reward_months} onChange={e => setRewardField(i, ri, { reward_months: e.target.value })} inputMode="numeric"
                                placeholder="12"
                                style={{ width: 80, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 11px', fontFamily: 'Inter', fontSize: '.8rem', textAlign: 'right', background: '#fff' }} />
                              <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 700 }}>ヶ月</span>
                            </div>
                          </>
                        )}
                        {/* トリガー */}
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>トリガー（成果地点）</label>
                          <input value={r.reward_trigger} onChange={e => setRewardField(i, ri, { reward_trigger: e.target.value })} placeholder="例: 賃貸成約で確定"
                            style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.76rem', boxSizing: 'border-box', background: '#fff' }} />
                        </div>
                        {/* 協力タスク（この報酬で必要なもの） */}
                        <div style={{ marginTop: 10 }}>
                          <label style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 5 }}>協力タスク（この報酬で必要なものを選ぶ）</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {COOP_TASK_MASTER.map(mt => {
                              const on = r.tasks.includes(mt.label)
                              return (
                                <label key={mt.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', cursor: 'pointer', padding: '4px 0' }}>
                                  <input type="checkbox" checked={on} onChange={() => toggleRewardTask(i, ri, mt.label)} style={{ accentColor: 'var(--c-blue)', width: 14, height: 14 }} />
                                  <span style={{ flex: 1, fontWeight: on ? 700 : 500, color: on ? 'var(--txt)' : 'var(--muted2)' }}>{mt.label}</span>
                                  <span style={{ fontSize: '.48rem', fontWeight: 700, color: mt.kind === 'auto' ? 'var(--green)' : 'var(--muted)', background: mt.kind === 'auto' ? 'var(--green-bg)' : 'var(--bg2)', borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{mt.kind === 'auto' ? '自動検知' : '手動'}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* ＋報酬を追加 */}
                    <button type="button" onClick={() => addReward(i)}
                      style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1.5px dashed var(--blue)', background: '#fff', color: 'var(--blue)', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 }}>
                      ＋ 報酬を追加
                    </button>
                  </div>
                ))}

                {/* ＋ メニューを追加（破線） */}
                <button type="button" onClick={addMenuDraft}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: '1.5px dashed var(--c-blue)', background: 'var(--blue-bg2)', color: 'var(--c-blue)', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
                  ＋ メニューを追加
                </button>
              </>
            )}

            {false && (
              <>
                <SectionLabel>B. 最初のメニュー（任意）</SectionLabel>
                <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 10px', lineHeight: 1.6 }}>
                  報酬を1つだけ先に設定できます。<b>協力タスク・ロゴ・複数メニュー等の詳細は、作成後の編集画面</b>で追加できます。
                </p>
                <Fld label="メニュー名（任意）">
                  <FInput value={addMenuName} onChange={setAddMenuName} placeholder="例: 賃貸成約時" />
                </Fld>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Fld label="固定報酬（円）">
                    <FInput value={addRefValue} onChange={setAddRefValue} placeholder="30000" type="number" />
                  </Fld>
                  <Fld label="成果報酬（粗利の%）">
                    <FInput value={addCoopPct} onChange={setAddCoopPct} placeholder="50" type="number" />
                  </Fld>
                </div>
                <p style={{ fontSize: '.58rem', color: 'var(--muted2)', margin: '2px 2px 0', lineHeight: 1.5 }}>
                  成果報酬の基準は<b>粗利</b>に固定です。空欄なら「名前だけ」で作成します。
                </p>
              </>
            )}

            {svcError && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 8 }}>{svcError}</p>}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button type="submit" disabled={submitting || !svcForm.name} className="btn btn-p"
                style={{ width: '100%', opacity: submitting || !svcForm.name ? .5 : 1 }}>
                {submitting ? '保存中…' : editing ? '保存してパートナー画面へ反映' : '作成してパートナー画面へ公開'}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }} />
              </button>
              {!editing && (addRefValue || addCoopPct) && (
                <button type="button" onClick={() => submitService(undefined, false)} disabled={submitting || !svcForm.name}
                  style={{ width: '100%', padding: '8px 0', borderRadius: 7, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--muted2)', fontSize: '.74rem', fontWeight: 700, cursor: submitting || !svcForm.name ? 'not-allowed' : 'pointer', opacity: submitting || !svcForm.name ? .5 : 1, fontFamily: 'inherit' }}>
                  名前だけで作る（報酬は後で）
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* ── Toast ── */}
      <div style={{
        position: 'fixed', bottom: 32, right: 32,
        transform: `translateY(${toast ? 0 : 16}px)`,
        background: 'var(--txt)', color: '#fff', padding: '12px 22px',
        borderRadius: 9, fontSize: '.74rem', fontWeight: 600,
        opacity: toast ? 1 : 0, pointerEvents: 'none',
        transition: 'all .28s', zIndex: 130, whiteSpace: 'nowrap',
        boxShadow: '0 8px 28px rgba(14,14,20,.18)',
      }}>
        {toast}
      </div>
    </>
  )
}
