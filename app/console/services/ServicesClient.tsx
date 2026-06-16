'use client'
import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import ServiceAvatar from '@/components/ServiceAvatar'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_OPTIONS = ['売上', '粗利', '利益', '受取収入']

const COVERAGE_DEFAULTS = [
  { label: 'つなぐ',             included: true  },
  { label: 'アポイント設定',     included: false },
  { label: '商談',               included: false },
  { label: '価格合意',           included: false },
  { label: 'フォロー・アシスト', included: false },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type CoverageStep = { label: string; included: boolean }

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
  coop_enabled: false, coop_type: 'rate', coop_value: '', coop_base: '',
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
          {uploading ? 'アップロード中…' : logoPath ? '画像を変更' : '画像を選択（PNG/SVG推奨）'}
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

function CoverageField({ steps, onChange }: { steps: CoverageStep[]; onChange: (s: CoverageStep[]) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6, letterSpacing: '.04em' }}>
        対応範囲
      </label>
      <CoverageEditor steps={steps} onChange={onChange} />
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

      <Fld label="メニュー名 *">
        <FInput value={f.name} onChange={v => set({ name: v })} placeholder="例: 賃貸成約時" />
      </Fld>

      {/* ── 紹介（referral） — 青 ── */}
      <div style={{ background: 'var(--blue-bg)', border: '1px solid #DDE2FF', borderRadius: 10, padding: 13, marginTop: 12 }}>
        <RewardBlockHead chip={<RefChip />} title="紹介報酬" val={f.ref_enabled} onToggle={v => set({ ref_enabled: v })} />

        {f.ref_enabled && (
          <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid #DDE2FF' }}>
            <Fld label="報酬タイプ">
              <TypeSeg value={f.ref_type} onChange={t => set({ ref_type: t })} accent="blue" />
            </Fld>

            {f.ref_type === 'fixed' ? (
              <Fld label="金額（円）">
                <FInput value={f.ref_value} onChange={v => set({ ref_value: v })} placeholder="30000" type="number" />
              </Fld>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Fld label="率（%）">
                  <FInput value={f.ref_value} onChange={v => set({ ref_value: v })} placeholder="10" type="number" />
                </Fld>
                <Fld label="基準">
                  <FSelect value={f.ref_base} onChange={v => set({ ref_base: v })}
                    options={BASE_OPTIONS.map(b => ({ v: b, l: b }))} placeholder="選択" />
                </Fld>
              </div>
            )}

            <Fld label="報酬発生条件（成果地点）">
              <FInput value={f.ref_trigger} onChange={v => set({ ref_trigger: v })} placeholder="例: 賃貸成約で確定" />
            </Fld>

            <CoverageField steps={f.coverage_steps} onChange={steps => set({ coverage_steps: steps })} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Fld label="資格条件（任意）">
                <FInput value={f.qualification} onChange={v => set({ qualification: v })} placeholder="例: 宅建業免許" />
              </Fld>
              <Fld label="継続（任意・ヶ月）">
                <FInput value={f.ref_months} onChange={v => set({ ref_months: v })} placeholder="例: 12" type="number" />
              </Fld>
            </div>
          </div>
        )}
      </div>

      {/* ── 協力（per-menu cooperation） — 濃色 ── */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 10, padding: 13, marginTop: 10 }}>
        <RewardBlockHead chip={<CoopChip />} title="協力報酬" val={f.coop_enabled} onToggle={v => set({ coop_enabled: v })} />

        {f.coop_enabled && (
          <div style={{ paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--line)' }}>
            <Fld label="協力タイプ">
              <TypeSeg value={f.coop_type} onChange={t => set({ coop_type: t })} accent="dark" />
            </Fld>

            {f.coop_type === 'fixed' ? (
              <Fld label="金額（円）">
                <FInput value={f.coop_value} onChange={v => set({ coop_value: v })} placeholder="50000" type="number" />
              </Fld>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Fld label="料率（%）">
                  <FInput value={f.coop_value} onChange={v => set({ coop_value: v })} placeholder="50" type="number" />
                </Fld>
                <Fld label="基準">
                  <FSelect value={f.coop_base} onChange={v => set({ coop_base: v })}
                    options={BASE_OPTIONS.map(b => ({ v: b, l: b }))} placeholder="選択" />
                </Fld>
              </div>
            )}

            <CoverageField steps={f.coop_coverage} onChange={steps => set({ coop_coverage: steps })} />

            <Fld label="資格条件（任意）">
              <FInput value={f.coop_condition} onChange={v => set({ coop_condition: v })} placeholder="例: 宅建業免許が必要" />
            </Fld>
          </div>
        )}
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

function RefChip() {
  return <span className="chip chip-referral" style={{ flexShrink: 0 }}>紹介</span>
}

function CoopChip() {
  return <span className="chip chip-cooperation" style={{ flexShrink: 0 }}>協力</span>
}

// Compact reward chip for the service list summary (紹介=青 / 協力=濃色).
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
      <span style={{ fontWeight: 800, opacity: .7, fontFamily: 'inherit' }}>{ref ? '紹介' : '協力'}</span>
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

export default function ServicesClient({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  const [services, setServices]  = useState(initialServices)
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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function openEdit(svc: ServiceWithMenus) {
    setSvcForm(svcToForm(svc))
    setEditing(svc); setShowAdd(false)
    setLiveMenus([...svc.service_menus].sort((a, b) => a.sort - b.sort))
    setMenuEditId(null); setSvcError('')
  }

  function openAdd() {
    setSvcForm({ ...defaultServiceForm })
    setEditing(null); setShowAdd(true)
    setLiveMenus([]); setMenuEditId(null); setSvcError('')
  }

  function closeDrawer() {
    setEditing(null); setShowAdd(false); setMenuEditId(null); setSvcError('')
  }

  const setF = (patch: Partial<ServiceForm>) => setSvcForm(f => ({ ...f, ...patch }))

  // ── Service save ──────────────────────────────────────────────────────────
  function saveService(e: React.FormEvent) {
    e.preventDefault()
    if (!svcForm.name) { setSvcError('サービス名を入力してください'); return }
    setSvcError('')
    startTrans(async () => {
      const url    = editing ? `/api/console/services/${editing.id}` : '/api/console/services'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svcFormToPayload(svcForm)) })
      if (!res.ok) { setSvcError(await res.text()); return }
      const data = await res.json()
      if (editing) {
        setServices(prev => prev.map(s => s.id === editing.id ? { ...s, ...data.service, service_menus: liveMenus } : s))
      } else {
        setServices(prev => [...prev, { ...data.service, service_menus: [] }])
      }
      showToast(editing ? '保存しました — パートナー画面へ反映' : 'サービスを追加しました')
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

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  function startAddMenu() {
    setMenuForm({ ...defaultMenuForm, coverage_steps: COVERAGE_DEFAULTS.map(s => ({ ...s })) })
    setMenuEditId('new'); setMenuError('')
  }
  function startEditMenu(m: MenuRow) { setMenuForm(menuToForm(m)); setMenuEditId(m.id); setMenuError('') }

  async function saveMenu() {
    if (!menuForm.name) { setMenuError('メニュー名を入力してください'); return }
    if (!menuForm.ref_enabled && !menuForm.coop_enabled) {
      setMenuError('紹介・協力のいずれかを有効にしてください'); return
    }
    if (menuForm.ref_enabled && menuForm.ref_type === 'rate') {
      const v = Number(menuForm.ref_value)
      if (!v || v <= 0 || v > 100) { setMenuError('率は 0〜100% の範囲で入力してください'); return }
      if (!menuForm.ref_base) { setMenuError('率タイプでは基準を選択してください'); return }
    }
    if (menuForm.coop_enabled && menuForm.coop_type === 'rate') {
      const v = Number(menuForm.coop_value)
      if (!v || v <= 0 || v > 100) { setMenuError('協力の料率は 0〜100% の範囲で入力してください'); return }
      if (!menuForm.coop_base) { setMenuError('協力（料率）では基準を選択してください'); return }
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
        {services.map(svc => {
          // 全メニューを表示（各行で ref_enabled/coop_enabled に応じて 紹介/協力 chip。category は廃止）
          const refMenus = svc.service_menus.filter(m => (m.ref_enabled ?? true) || m.coop_enabled === true)
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
                <button onClick={() => openEdit(svc)}
                  style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, flexShrink: 0 }}>
                  編集
                </button>
              </div>

              {/* Per-menu summary */}
              {refMenus.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {refMenus.map(menu => {
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
                      <div key={menu.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ flex: 1, fontSize: '.74rem', fontWeight: 600, color: 'var(--txt)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {menu.name}
                        </span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {showRef && <RewardChip kind="ref" text={fmtRef(menu)} />}
                          {showCoop && <RewardChip kind="coop" text={coopText} />}
                        </div>
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

      {/* ── Drawer ── */}
      <div style={{
        position: 'fixed', right: drawerOpen ? 0 : '-520px', top: 0, height: '100vh', width: 500,
        background: '#fff', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 40px rgba(14,14,20,.12)',
        zIndex: 50, overflowY: 'auto', transition: 'right .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {drawerOpen && (
          <form key={editing?.id ?? 'new'} onSubmit={saveService} className="cascade" style={{ padding: '24px 26px 88px' }}>

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

            {/* ── B. 紹介メニュー（編集時のみ） ── */}
            {editing && (
              <>
                <SectionLabel>B. 紹介メニューと報酬</SectionLabel>

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

            {/* 協力はメニュー単位（B のメニュー編集内）に一本化。サービス既定 coop_* は廃止。 */}

            {svcError && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 8 }}>{svcError}</p>}

            <div style={{ marginTop: 16 }}>
              <button type="submit" disabled={submitting || !svcForm.name} className="btn btn-p"
                style={{ width: '100%', opacity: submitting || !svcForm.name ? .5 : 1 }}>
                {submitting ? '保存中…' : '保存してパートナー画面へ反映'}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }} />
              </button>
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
