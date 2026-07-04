'use client'
// 静音化v2.1: 稟議ステージ(review_stage)は概念廃止＝UI/保存関数を撤去（API /review-stage・DB列・既存データは残置＝コードから到達不能のdeprecate）。
import { useEffect, useState, useTransition, useRef } from 'react'
import ServiceAvatar from '@/components/ServiceAvatar'
import ChannelMark from '@/components/ChannelMark'
import ConsoleNav from '@/components/ConsoleNav'
import { customerHonorific } from '@/lib/customer'
import { computeProjectPnl } from '@/lib/pnl'
import { phaseOf, PHASE_LABEL, PROJECT_STATUSES, PROJECT_STATUS_STYLE } from '@/lib/phase'
import RewardPill from '@/components/ui/RewardPill'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { DEAL_STATUS } from '@/lib/status'
import { engagementLabel } from '@/lib/engagement-labels'
// 操縦席: ステータス翻訳レイヤー（3面写像・遷移の結果予告・次アクション）の単一ソース。文言/写像のハードコード禁止。
import { statusTranslation, projectLaneTranslation, transitionForecast, forecastLine, statusEntryEffects, OPS_NEXT_ACTION, DEAL_STATUS_KEYS } from '@/lib/status-effects'
import Link from 'next/link'
import dynamic from 'next/dynamic'
// A: ドロワー内でのみ使う重い子を遅延読込（初回バンドルから除外・押下/展開時に取得）。
const DeliveryProgress = dynamic(() => import('./DeliveryProgress'), { ssr: false, loading: () => <div className="ui-skeleton" style={{ height: 120, borderRadius: 12 }} /> })
const ContinuousMonthly = dynamic(() => import('./ContinuousMonthly'), { ssr: false, loading: () => <div className="ui-skeleton" style={{ height: 200, borderRadius: 12, marginTop: 18 }} /> })

type Deal = {
  id: string; customer_name: string; channel: string; source: string
  customer_type?: string | null; company_name?: string | null; contact_name?: string | null; contact_title?: string | null
  status: string; amount: number; base_amount: number | null; created_at: string; service_id: string
  customer_email?: string | null; fixed_month?: string | null
  lost_at?: string | null; lost_reason?: string | null; lost_note?: string | null
  reward_snapshot: { ref_type?: string; ref_value?: number; ref_base?: string; effective_kind?: string; gate_reason?: string; reward_type?: string; reward_value?: number; months?: number } | null
  continuous_months?: number | null
  service_menus: { name?: string | null; coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null; coop_base?: string | null } | null
  // メニュー名（API側で reward_snapshot.menu_id → menus.name を一括解決・無ければ service_menus 名）
  _menu_name?: string | null
  services: { name: string; icon: string; color: string; logo_path?: string | null } | null
  partners: { code: string; profiles: { name: string; color: string } | null } | null
  deal_items?: DealItem[]
  // A1: P&L
  director_id?: string | null
  other_cost?: number | null
  _frontier_override?: number
  // A2a: デリバリー
  _deliveries?: DeliveryAssign[]
  _delivery_cost?: number
  // A2b: 承認済経費合計
  _delivery_expense?: number
  // F-1: 流入経路・フェーズ・プロジェクト実行ステータス（お金には非干渉の独立メタデータ）
  intake_type?: string | null
  project_status?: string | null
  _phase?: 'shodan' | 'project'
}

// N: 失注理由（選択式）
const LOST_REASONS = ['予算', 'タイミング', '競合', '連絡途絶', 'ニーズ不一致', 'お客様都合', 'その他'] as const

type Service = { id: string; name: string; icon: string; color: string }
// L2: 案件明細（A1: revenue=受注額/売上）
type DealItem = { id: string; service_id: string; menu_id?: string | null; kind: string; amount: number; base_amount: number | null; revenue?: number | null; sort: number; services?: { name: string } | null }
type Director = { id: string; name: string; role: string; color: string }
// A2a: デリバリー（C1: service_id＝得意サービス。null=全サービス扱い）
type DeliveryOpt = { id: string; name: string; kind: string | null; service_id?: string | null }
// A2b: 経費申請（割当単位）
type Expense = { id: string; delivery_assignment_id: string; kind: string; amount: number; status: string; has_evidence?: boolean; note?: string | null }
type DeliveryAssign = { id: string; deal_item_id: string | null; delivery_id: string | null; base_fee: number; deliveries?: { name: string; kind: string | null } | null; _expenses?: Expense[] }
type SvcMenu = { id: string; name: string; ref_type?: string | null; ref_value?: number | null; coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null }
type SvcWithMenus = { id: string; name: string; service_menus?: SvcMenu[] }

// ⑧ Determine whether a deal's reward is %-based (needs a real-amount base).
// cooperation → selected menu's coop_* (fixed = no base)。協力dealはmenu_idバックフィル済でメニュー一本化。
// 継続報酬（毎月）の情報。月次入力は continuous_payouts、率は凍結 snapshot、期間は deal 優先。
function continuousInfo(d: Deal): { isContinuous: boolean; rate: number; months: number | null } {
  const rs = d.reward_snapshot as { reward_type?: string; reward_value?: number; months?: number } | null
  if (rs?.reward_type === 'continuous') return { isContinuous: true, rate: Number(rs.reward_value ?? 0), months: d.continuous_months ?? rs.months ?? null }
  return { isContinuous: false, rate: 0, months: null }
}
function rateInfo(d: Deal): { isRate: boolean; rate: number | null; baseLabel: string } {
  // 新モデル：申し込まれた報酬(menu_rewards)が reward_snapshot に焼かれていればそれを正とする（計算式は不変）。
  const rs = d.reward_snapshot as { reward_type?: string; reward_value?: number; reward_base?: string } | null
  // 継続は月次入力で扱う＝単発の率ベース(base_amount)UIには乗せない。
  if (rs?.reward_type === 'continuous') return { isRate: false, rate: null, baseLabel: rs.reward_base ?? '粗利' }
  if (rs?.reward_type === 'rate') return { isRate: true, rate: Number(rs.reward_value ?? 0), baseLabel: rs.reward_base ?? '粗利' }
  if (rs?.reward_type === 'fixed') return { isRate: false, rate: null, baseLabel: rs.reward_base ?? '粗利' }
  if (d.channel === 'cooperation') {
    const m = d.service_menus
    if (m?.coop_enabled) {
      if (m.coop_type === 'fixed') return { isRate: false, rate: null, baseLabel: m.coop_base ?? '売上' }
      return { isRate: true, rate: Number(m.coop_value ?? 0), baseLabel: m.coop_base ?? '売上' }
    }
    return { isRate: false, rate: null, baseLabel: '売上' }
  }
  if (d.reward_snapshot?.ref_type === 'rate') {
    return { isRate: true, rate: Number(d.reward_snapshot.ref_value), baseLabel: d.reward_snapshot.ref_base ?? '売上' }
  }
  return { isRate: false, rate: null, baseLabel: '売上' }
}
function needsBase(d: Deal): boolean {
  return rateInfo(d).isRate && (d.base_amount == null)
}
// メニュー名（APP正典 app/app/cases/[id] と同じ解決順：新名称 menus.name 優先 → service_menus.name）。
function menuLabelOf(d: Deal): string | null {
  return d._menu_name ?? d.service_menus?.name ?? null
}

// 失注理由の表示ラベル（'お客様都合' はDB保存値のため値は変えず、表示のみ規範「お客さま」に揃える）。
function lostReasonLabel(r: string): string {
  return r === 'お客様都合' ? 'お客さま都合' : r
}

// v2.2：列ヘッダの塗り分け（accentBg）は撤去。ヘッダは 6pxドット（--st-* 意味色）＋テキストで示す。
const COLS = [
  { key: 'received',    label: '受付' },
  { key: 'in_progress', label: '対応中' },
  { key: 'confirmed',   label: '成約' },
  { key: 'paid',        label: '支払済' },
  { key: 'lost',        label: '不成立' },
] as const

type Status = typeof COLS[number]['key']

// 静音化v2: 案件詳細「進行」の縦タイムライン（DealStepper横4段の代替＝表示のみ・onClick/mutationなし）。
// 段階・順序・ラベルは lib/status.ts(SSoT)から導出。lostは「不成立」終端項目（lost_at/理由）。
const DEAL_FLOW = ['received', 'in_progress', 'confirmed', 'paid'] as const
function StatusTimeline({ deal }: { deal: Deal }) {
  const isLost = deal.status === 'lost'
  const curIdx = DEAL_FLOW.indexOf(deal.status as typeof DEAL_FLOW[number])
  const fmtDateTime = (v: string) => new Date(v).toLocaleString('ja', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  // 日時は取れるものだけ: 受付=created_at ／ 成約=fixed_month（確定月） ／ 不成立=lost_at
  const dateOf = (k: string): string | null => {
    if (k === 'received') return fmtDateTime(deal.created_at)
    if (k === 'confirmed' && deal.fixed_month) {
      const d = new Date(deal.fixed_month)
      return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric' })
    }
    return null
  }
  // lost は 受付→不成立 の終端表示（途中段の推測はしない）
  const rows: { key: string; label: string; state: 'done' | 'current' | 'future' | 'lost'; date: string | null; extra?: React.ReactNode }[] = isLost
    ? [
        { key: 'received', label: DEAL_STATUS.received.label, state: 'done', date: dateOf('received') },
        {
          key: 'lost', label: '不成立', state: 'lost', date: deal.lost_at ? fmtDateTime(deal.lost_at) : null,
          extra: (deal.lost_reason || deal.lost_note) ? (
            <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--muted2)', lineHeight: 1.6, marginTop: 2 }}>
              {deal.lost_reason ? `理由：${lostReasonLabel(deal.lost_reason)}` : ''}{deal.lost_reason && deal.lost_note ? '・' : ''}{deal.lost_note ?? ''}
            </span>
          ) : undefined,
        },
      ]
    : DEAL_FLOW.map((k, i) => ({
        key: k, label: DEAL_STATUS[k].label,
        state: (i < curIdx ? 'done' : i === curIdx ? 'current' : 'future') as 'done' | 'current' | 'future',
        date: i <= curIdx ? dateOf(k) : null,
      }))
  return (
    <div>
      {rows.map((r, i) => {
        const dot = r.state === 'lost'
          ? { background: 'var(--st-danger)', border: 'none', boxShadow: 'none' }
          : r.state === 'done' ? { background: 'var(--c-blue)', border: 'none', boxShadow: 'none' }
          : r.state === 'current' ? { background: 'var(--c-blue)', border: 'none', boxShadow: '0 0 0 3px var(--blue-bg)' }
          : { background: '#fff', border: '1px solid var(--muted)', boxShadow: 'none' }
        const reached = r.state !== 'future'
        return (
          <div key={r.key} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 9, flexShrink: 0 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5, boxSizing: 'border-box', ...dot }} />
              {i < rows.length - 1 && <span aria-hidden style={{ width: 1, flex: 1, minHeight: 14, background: 'var(--line)' }} />}
            </div>
            <div style={{ paddingBottom: i < rows.length - 1 ? 14 : 0, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: r.state === 'current' || r.state === 'lost' ? 500 : 400, color: reached ? 'var(--txt)' : 'var(--muted2)', lineHeight: '17px', display: 'block' }}>{r.label}</span>
              {r.date && <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--muted2)', marginTop: 1 }}>{r.date}</span>}
              {r.extra}
            </div>
          </div>
        )
      })}
    </div>
  )
}
// 静音化v2: セクション見出し＝11px/500/muted＋余白のみ（カード枠・罫線囲みなし）。
function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', margin: first ? '0 0 12px' : '22px 0 12px' }}>
      {children}
    </p>
  )
}
// 静音化v2(C): レーンの3面写像は常時表示せず、ホバー/クリックのツールチップへ退避（statusTranslation正典由来）。
function MappingTip({ partner, vendor, children }: { partner: string; vendor: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', minWidth: 0 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onClick={e => { e.stopPropagation(); setOpen(o => !o) }}>
      {children}
      {open && (
        <span role="tooltip" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, background: 'var(--txt)', color: '#fff', fontSize: 11, fontWeight: 400, lineHeight: 1.5, borderRadius: 8, padding: '6px 10px', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          パートナー：{partner}／デリバリー：{vendor}
        </span>
      )}
    </span>
  )
}

// QR: ボードはアクティブ3列のみ（成約・確定=入金待ちは残す）。支払済/不成立はアーカイブへ。
const BOARD_KEYS: string[] = ['received', 'in_progress', 'confirmed']
// 通常フローは線形（不成立は別操作・再開可能）。前進は OPS_NEXT_ACTION（正典）駆動のCTAに一本化＝NEXTマップは廃止。
const PREV: Record<string, Status | null> = {
  received: null, in_progress: 'received', confirmed: 'in_progress', paid: 'confirmed', lost: null,
}

// F-3a: フェーズ×ステータスのパイプライン・レーン。商談(status由来)→プロジェクト(project_status由来)。
//   group=shodan は deals.status、group=project は project_status を担当（直営業は商談を飛ばしプロジェクトへ）。
type Lane = { key: string; label: string; group: 'shodan' | 'project'; tone: 'warn' | 'progress' | 'success' | 'danger' | 'neutral' }
const SHODAN_LANES: Lane[] = [
  { key: 'received',    label: '受付',   group: 'shodan', tone: 'warn' },
  { key: 'in_progress', label: '商談中', group: 'shodan', tone: 'progress' },
]
const PROJECT_LANES: Lane[] = [
  // 静音化v2.1(A2): レーン名は正典 DEAL_STATUS.confirmed.label（=成約）から導出（「成約・未着手」廃止）。
  { key: '未着手', label: DEAL_STATUS.confirmed.label, group: 'project', tone: 'neutral' },
  { key: '進行中', label: '進行中',       group: 'project', tone: 'progress' },
  { key: '確認待ち', label: '確認待ち',   group: 'project', tone: 'warn' },
  { key: '修正対応', label: '修正対応',   group: 'project', tone: 'danger' },
  { key: '納品完了', label: '納品完了',   group: 'project', tone: 'success' },
  { key: '保留',   label: '保留',         group: 'project', tone: 'neutral' },
]
const PIPELINE_LANES: Lane[] = [...SHODAN_LANES, ...PROJECT_LANES]
// 案件が属するレーンキー（商談=status／プロジェクト=project_status・null は 未着手 とみなす）。
function laneKeyOf(d: { status: string; intake_type?: string | null; project_status?: string | null; _phase?: 'shodan' | 'project' }): string {
  const phase = d._phase ?? phaseOf(d)
  if (phase === 'shodan') return d.status                 // received | in_progress
  return d.project_status ?? '未着手'
}

// A2b: 割当ごとの経費（一覧＋承認/却下＋追加＋領収書プレビュー）。
const EXP_KINDS = ['交通', '宿泊', 'その他'] as const
function DeliveryExpenses({ assign, editable, busy, onAdd, onStatus, onDelete, onView }: {
  assign: DeliveryAssign; editable: boolean; busy: boolean
  onAdd: (assignId: string, kind: string, amount: string, file: File | null) => void
  onStatus: (expId: string, status: 'approved' | 'rejected' | 'submitted') => void
  onDelete: (expId: string) => void
  onView: (expId: string) => void
}) {
  const [kind, setKind] = useState<string>('交通')
  const [amount, setAmount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const exps = assign._expenses ?? []
  const approved = exps.filter(e => e.status === 'approved').reduce((s, e) => s + (e.amount ?? 0), 0)
  const badge = (s: string) => s === 'approved' ? { t: '承認済', c: 'var(--green)', bg: 'var(--green-bg)' }
    : s === 'rejected' ? { t: '却下', c: 'var(--red)', bg: 'var(--red-bg)' } : { t: '申請中', c: 'var(--amber)', bg: 'var(--amber-bg)' }
  function submit() {
    if (!amount.trim()) return
    onAdd(assign.id, kind, amount, file)
    setAmount(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
  }
  return (
    <div style={{ marginTop: 6, marginLeft: 10, paddingLeft: 8, borderLeft: '2px solid var(--blue-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: '.54rem', color: 'var(--muted2)', fontWeight: 500 }}>経費（¥{approved.toLocaleString()}）</span>
      </div>
      {exps.map(e => {
        const b = badge(e.status)
        return (
          <div key={e.id} className="ui-row" style={{ gap: 5, padding: '3px 0', fontSize: '.62rem' }}>
            <span style={{ color: 'var(--muted2)', width: 36, flexShrink: 0 }}>{e.kind}</span>
            <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 500, minWidth: 56, textAlign: 'right' }}>¥{(e.amount ?? 0).toLocaleString()}</span>
            <span style={{ fontSize: '.5rem', fontWeight: 500, color: b.c, background: b.bg, borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{b.t}</span>
            {e.has_evidence && <button onClick={() => onView(e.id)} title="領収書を開く" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.56rem', fontWeight: 500, color: 'var(--c-blue)', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>領収書</button>}
            <span style={{ flex: 1 }} />
            {e.status !== 'approved' && <button onClick={() => onStatus(e.id, 'approved')} disabled={busy} style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--green)', background: 'none', border: '1px solid var(--green)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer' }}>承認</button>}
            {e.status !== 'rejected' && <button onClick={() => onStatus(e.id, 'rejected')} disabled={busy} style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer' }}>却下</button>}
            <button onClick={() => onDelete(e.id)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.62rem' }}>✕</button>
          </div>
        )
      })}
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <select value={kind} onChange={e => setKind(e.target.value)} disabled={busy} style={{ border: '0.5px solid var(--line)', borderRadius: 6, padding: '3px 5px', fontFamily: 'inherit', fontSize: '.6rem', background: '#fff' }}>
            {EXP_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="金額" disabled={busy}
            style={{ width: 64, border: '0.5px solid var(--line)', borderRadius: 6, padding: '3px 6px', fontFamily: 'Inter', fontSize: '.62rem', textAlign: 'right' }} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy}
            style={{ fontSize: '.52rem', width: 116 }} />
          <button onClick={submit} disabled={busy || !amount.trim()} style={{ fontSize: '.58rem', fontWeight: 500, color: '#fff', background: 'var(--c-blue)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', opacity: (busy || !amount.trim()) ? .5 : 1 }}>経費を追加</button>
        </div>
      )}
    </div>
  )
}

// C1: デリバリー候補の2群表示 — サービス一致を先頭グループ、それ以外（service_id未設定含む）を「その他の委託先」へ。
//   一致が1件もなければ従来どおりフラットに並べる（空のoptgroupは出さない）。
function DeliveryOptGroups({ opts, serviceId }: { opts: DeliveryOpt[]; serviceId: string | null }) {
  const mine = serviceId ? opts.filter(o => o.service_id === serviceId) : []
  if (mine.length === 0) return <>{opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</>
  const others = opts.filter(o => o.service_id !== serviceId)
  return (
    <>
      <optgroup label="このサービスの担当">{mine.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
      {others.length > 0 && <optgroup label="その他の委託先">{others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>}
    </>
  )
}

export default function DealsPage() {
  const [deals, setDeals]           = useState<Deal[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Deal | null>(null)
  // ④ 対応範囲（協力タスク）：管理側が done を確認して立てる（パートナー自己申告から移管）。done値の読み書きのみ・money計算不変。
  const [dealTasks, setDealTasks]   = useState<{ id: string; label: string; kind: string; required: boolean; done: boolean; sort: number; note?: string | null }[]>([])
  const [taskBusy, setTaskBusy]     = useState<string | null>(null)
  const [profile, setProfile]       = useState<{ name: string; color: string } | null>(null)
  const [pending, startTransition]  = useTransition()
  // 実装2: トーストを {msg, undo?} 型へ拡張（既存 showToast('文字列') 呼び出しはそのまま動く）。undo付きは8秒表示。
  const [toast, setToast]           = useState<{ msg: string; undo?: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filterSvc, setFilterSvc]   = useState('all')
  const [services, setServices]     = useState<Service[]>([])
  const dragItem = useRef<{ id: string; status: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // 静音化v2.1(A3): 空レーンの畳み機構（expandedEmpty）は撤去＝空レーンも通常ヘッダ＋件数0で常時表示。
  // ② base-amount entry on confirming a rate-based deal
  const [baseModal, setBaseModal] = useState<{ deal: Deal; rate: number; baseLabel: string } | null>(null)
  const [baseInput, setBaseInput] = useState('')
  // ① edit 実績金額 from the detail panel (any status)
  const [editingBase, setEditingBase] = useState(false)
  // 実装4: タブ廃止→縦1カラム。金額・原価セクションの折りたたみ（received/in_progress のみ・既定閉）。
  //   <details> の open を state と同期し、閉時は中身を非レンダリング＝動的import(DeliveryProgress)は開くまでマウントしない。
  const [moneyOpen, setMoneyOpen] = useState(false)
  const moneyRef = useRef<HTMLDivElement | null>(null)   // 「明細を追加して成約へ」からのスクロール先
  const baseBoxRef = useRef<HTMLDivElement | null>(null) // 「実績金額を入力する」からのスクロール先
  // 実装2: 波及あり遷移（3面表示変化/メール送信）の確定前確認モーダル。
  const [moveConfirm, setMoveConfirm] = useState<{ deal: Deal; to: Status } | null>(null)
  // 静音化v2(A2): 動詞CTA・管理操作の確認ダイアログ（本文=forecastLine＋precondition・実行する/キャンセル）。
  //   reopen=true は lost→in_progress の復活（reopenDeal＝lost_*クリア）。承認後は既存ガード分岐が関数内で活きる。
  const [ctaConfirm, setCtaConfirm] = useState<{ deal: Deal; to: Status; from: string; precondition?: string; reopen?: boolean } | null>(null)
  // 実装3: ステータスマトリクス（3面写像＋通知メール）のⓘシート。
  const [matrixOpen, setMatrixOpen] = useState(false)
  const [baseEdit, setBaseEdit] = useState('')
  // N: 不成立化モーダル（理由＋メモ）
  const [lostModal, setLostModal] = useState<Deal | null>(null)
  const [lostReason, setLostReason] = useState<string>('')
  const [lostNote, setLostNote] = useState('')
  // A3: ヘッダ「…」管理メニュー（不成立にする/案件を取り消す）＋取り消しの確認ダイアログ（window.confirm廃止）。
  const [manageOpen, setManageOpen] = useState(false)
  const manageRef = useRef<HTMLDivElement>(null)
  const [cancelConfirm, setCancelConfirm] = useState<Deal | null>(null)
  // QR: ボード（アクティブ3列） / アーカイブ（支払済＋不成立）
  const [view, setView] = useState<'board' | 'archive'>('board')
  const [archiveSearch, setArchiveSearch] = useState('')
  // L2: 明細編集用（サービス+メニューのマスタ／追加フォーム）
  const [svcMenus, setSvcMenus] = useState<SvcWithMenus[]>([])
  const [itemForm, setItemForm] = useState<{ service_id: string; menu_id: string; amount: string; base_amount: string }>({ service_id: '', menu_id: '', amount: '', base_amount: '' })
  const [itemBusy, setItemBusy] = useState(false)
  // A1: MB担当の選択肢（内部メンバー）／A2a: デリバリー委託先の選択肢
  const [directors, setDirectors] = useState<Director[]>([])
  const [deliveriesOpt, setDeliveriesOpt] = useState<DeliveryOpt[]>([])

  // F-3a: ボードのフィルタ（流入経路・フェーズ・MB担当・パートナー）。
  const [filterIntake, setFilterIntake] = useState('all')
  const [filterPhase, setFilterPhase] = useState('all')
  const [filterDirector, setFilterDirector] = useState('all')
  const [filterPartner, setFilterPartner] = useState('all')
  // F-3a/D: 直営業プロジェクト起票モーダル（サービス=svcMenusマスタ・メニュー/MB担当/デリバリーは任意）。
  const [directModal, setDirectModal] = useState(false)
  const emptyDirectForm = { customer_name: '', service_id: '', menu_id: '', revenue: '', director_id: '', delivery_id: '' }
  const [directForm, setDirectForm] = useState<{ customer_name: string; service_id: string; menu_id: string; revenue: string; director_id: string; delivery_id: string }>(emptyDirectForm)
  const [directBusy, setDirectBusy] = useState(false)

  useEffect(() => {
    fetch('/api/console/deals').then(r => r.json()).then(d => {
      setDeals(d.deals)
      setProfile(d.profile)
      setDirectors(d.directors ?? [])
      setDeliveriesOpt(d.deliveries ?? [])
      // Extract unique services from deals
      const svcMap = new Map<string, Service>()
      for (const deal of d.deals) {
        if (deal.services && !svcMap.has(deal.service_id)) {
          svcMap.set(deal.service_id, { id: deal.service_id, ...deal.services })
        }
      }
      setServices(Array.from(svcMap.values()))
    }).finally(() => setLoading(false))
    // L2: サービス+メニューのマスタ（明細追加フォーム用）
    fetch('/api/services').then(r => r.json()).then((svcs: SvcWithMenus[]) => setSvcMenus(svcs ?? [])).catch(() => {})
  }, [])

  // 要対応/最近の動き 等からの ?deal=<id> で、ボードへ飛ばさず該当案件の詳細を直接開く。
  useEffect(() => {
    if (typeof window === 'undefined' || deals.length === 0) return
    const id = new URLSearchParams(window.location.search).get('deal')
    if (id) { const d = deals.find(x => x.id === id); if (d) setSelected(d) }
  }, [deals])

  // ④ 選択中 deal が協力なら deal_tasks を読み込む（管理側表示）。それ以外はクリア。
  useEffect(() => {
    if (!selected || selected.channel !== 'cooperation') { setDealTasks([]); return }
    let alive = true
    fetch(`/api/console/deals/${selected.id}/tasks`).then(r => r.ok ? r.json() : { tasks: [] }).then(d => { if (alive) setDealTasks(d.tasks ?? []) }).catch(() => {})
    return () => { alive = false }
  }, [selected])

  // 実装4: 案件を切り替えたら編集/折りたたみ状態をリセット（タブ廃止に伴い detailTab リセットは削除）。A3: 「…」メニューも閉じる。
  useEffect(() => { setEditingBase(false); setMoneyOpen(false); setManageOpen(false) }, [selected?.id])

  // A3: 「…」メニューは外側クリックで閉じる。
  useEffect(() => {
    if (!manageOpen) return
    const onDoc = (e: MouseEvent) => { if (manageRef.current && !manageRef.current.contains(e.target as Node)) setManageOpen(false) }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [manageOpen])

  // ④ 管理側で done を立て/外す（done_by=管理者）。requiredTasksDone・確定ゲート・レート計算は不変（done値を書くだけ）。
  async function toggleDealTask(taskId: string, next: boolean) {
    if (!selected || taskBusy) return
    setTaskBusy(taskId)
    setDealTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: next } : t))   // optimistic
    try {
      const r = await fetch(`/api/console/deals/${selected.id}/tasks`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, done: next }) })
      if (!r.ok) setDealTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: !next } : t))
      else showToast(next ? '対応済にしました' : '未対応に戻しました')
    } catch { setDealTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: !next } : t)) } finally { setTaskBusy(null) }
  }

  function showToast(msg: string, opts?: { undo?: () => void; duration?: number }) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, undo: opts?.undo })
    toastTimer.current = setTimeout(() => setToast(null), opts?.duration ?? 2200)
  }

  // 静音化v2: 動詞CTAの特殊分岐からの誘導。金額・原価セクションを開いてスクロール／実績金額の入力を開いてスクロール。
  function openMoneySection() {
    setMoneyOpen(true)
    setTimeout(() => moneyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  function openBaseEntry(deal: Deal) {
    setEditingBase(true)
    setBaseEdit(deal.base_amount?.toString() ?? '')
    setTimeout(() => baseBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  // L2: 明細変更後にボードを再取得し選択中dealを更新（deals.amount=Σ・明細を反映）。
  async function refreshDeals(keepId?: string) {
    const d = await fetch('/api/console/deals').then(r => r.json())
    setDeals(d.deals)
    if (keepId) setSelected(d.deals.find((x: Deal) => x.id === keepId) ?? null)
  }
  // F-3a: 任意の deal の project_status を変更（ボードのプロジェクト・レーン間ドラッグ用）。お金に非干渉。
  // 実装2: 波及なし（3面表示・メール不変）のため確認は挟まず即時実行。ドロップ経由(opts.undoFrom)は Undoトースト8秒。
  async function setProjectStatusForDeal(deal: Deal, ps: string, opts?: { undoFrom: string; laneLabel: string }) {
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, project_status: ps } : d))  // 楽観更新
    if (selected?.id === deal.id) setSelected(s => s ? { ...s, project_status: ps } : s)
    try {
      const res = await fetch(`/api/console/deals/${deal.id}/project-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_status: ps }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.needsMigration) { showToast(data.needsMigration ? 'project_status列のDB適用が必要です' : (data.error ?? '更新に失敗しました')); await refreshDeals(selected?.id) }
      else if (opts) showToast(`「${opts.laneLabel}」へ移動しました`, { duration: 8000, undo: () => setProjectStatusForDeal(deal, opts.undoFrom) })
      else showToast(`プロジェクト状態を「${ps}」に変更しました`)
    } catch { showToast('更新に失敗しました'); await refreshDeals(selected?.id) }
  }
  // F-3a/D: 直営業プロジェクト起票（intake=direct → API が MB直営・confirmed・amount=0・未着手 で作成）。
  //   起票後: MB担当→PATCH pnl／デリバリー→POST deliveries（明細id=レスポンスitem.id・委託費0）→ refresh→ドロワーを開く。
  async function createDirectProject() {
    if (!directForm.customer_name.trim() || !directForm.service_id) { showToast('企業名とサービスを入力してください'); return }
    setDirectBusy(true)
    try {
      const revenue = Math.max(0, Number((directForm.revenue || '').replace(/[,，\s]/g, '')) || 0)
      const res = await fetch('/api/console/deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_name: directForm.customer_name.trim(), service_id: directForm.service_id, menu_id: directForm.menu_id || null, intake_type: 'direct', revenue }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.deal) {
        // (b) MB担当 — P&Lメタのみ（reward/payout非接触）。best-effort（失敗してもドロワーで割当可能）。
        if (directForm.director_id) {
          await fetch(`/api/console/deals/${data.deal.id}/pnl`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ director_id: directForm.director_id }) }).catch(() => {})
        }
        // (c) デリバリー — 起票明細（item.id）へ割当（委託費0・P&L読取専用）。
        if (directForm.delivery_id) {
          await fetch(`/api/console/deals/${data.deal.id}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_item_id: data.item?.id ?? null, delivery_id: directForm.delivery_id, base_fee: 0 }) }).catch(() => {})
        }
        await refreshDeals(data.deal.id)
        setDirectModal(false); setDirectForm(emptyDirectForm)
        showToast('直営業プロジェクトを起票しました')
      }
      else showToast(data.error ?? '起票に失敗しました')
    } catch { showToast('起票に失敗しました') } finally { setDirectBusy(false) }
  }
  async function addItem() {
    if (!selected || !itemForm.service_id) { showToast('サービスを選択してください'); return }
    const menu = svcMenus.find(s => s.id === itemForm.service_id)?.service_menus?.find(m => m.id === itemForm.menu_id)
    const kind = menu ? (selected.channel === 'cooperation' ? (menu.coop_type === 'rate' ? 'rate' : 'fixed') : (menu.ref_type === 'rate' ? 'rate' : 'fixed')) : 'fixed'
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: itemForm.service_id, menu_id: itemForm.menu_id || null, kind, amount: itemForm.amount, base_amount: itemForm.base_amount }),
      })
      const data = await res.json()
      if (res.ok && data.item) { await refreshDeals(selected.id); setItemForm({ service_id: '', menu_id: '', amount: '', base_amount: '' }); showToast('明細を追加しました') }
      else showToast(data.error ?? '追加に失敗しました')
    } catch { showToast('追加に失敗しました') } finally { setItemBusy(false) }
  }
  async function patchItem(itemId: string, body: Record<string, unknown>) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/items/${itemId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) await refreshDeals(selected.id)
      else showToast(data.error ?? '更新に失敗しました')
    } catch { showToast('更新に失敗しました') } finally { setItemBusy(false) }
  }
  async function deleteItem(itemId: string) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/items/${itemId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { await refreshDeals(selected.id); showToast('明細を削除しました') }
      else showToast(data.error ?? '削除に失敗しました')
    } catch { showToast('削除に失敗しました') } finally { setItemBusy(false) }
  }
  // A1: P&Lメタ（MB担当・その他原価）。reward/payout 非接触。
  async function savePnl(body: Record<string, unknown>) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/pnl`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.needsMigration) {
        // 静音化v2.1(B2): MB担当の保存はrefresh待ちにせず selected/deals へ即時反映（体感のための楽観更新・確定はrefreshで上書き）。
        if ('director_id' in body) {
          const did = (body.director_id as string | null) ?? null
          const dealId = selected.id
          setSelected(s => s && s.id === dealId ? { ...s, director_id: did } : s)
          setDeals(prev => prev.map(d => d.id === dealId ? { ...d, director_id: did } : d))
        }
        await refreshDeals(selected.id)
      }
      else if (data.needsMigration) showToast('P&L列のDB適用が必要です（batchPnlA1 DDL）')
      else showToast(data.error ?? '保存に失敗しました')
    } catch { showToast('保存に失敗しました') } finally { setItemBusy(false) }
  }
  // F-1: プロジェクト実行ステータス更新（独立ルート）。reward/frozen/payout/status/amount には一切触れない。
  async function saveProjectStatus(ps: string | null) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/project-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_status: ps }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.needsMigration) { await refreshDeals(selected.id); showToast('プロジェクト状態を更新しました') }
      else if (data.needsMigration) showToast('project_status列のDB適用が必要です（batchF1 DDL）')
      else showToast(data.error ?? '保存に失敗しました')
    } catch { showToast('保存に失敗しました') } finally { setItemBusy(false) }
  }
  // A2a: 明細のデリバリー割当を set/clear（delivery_id null＝MB自身/委託費0）。reward/payout 非接触。
  async function setItemDelivery(dealItemId: string, deliveryId: string | null, baseFee: number) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_item_id: dealItemId, delivery_id: deliveryId, base_fee: baseFee }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.needsMigration) await refreshDeals(selected.id)
      else if (data.needsMigration) showToast('デリバリーのDB適用が必要です（batchA2a DDL）')
      else showToast(data.error ?? '割当に失敗しました')
    } catch { showToast('割当に失敗しました') } finally { setItemBusy(false) }
  }

  // A2b: 経費を追加（割当単位・領収書は任意・サーバ経由アップロード）。承認時のみP&L反映。reward/payout 非接触。
  async function addExpense(assignmentId: string, kind: string, amount: string, file: File | null) {
    if (!selected) return
    const amt = Math.max(0, Number((amount || '').replace(/[,，\s]/g, '')))
    if (!amt) { showToast('金額を入力してください'); return }
    setItemBusy(true)
    try {
      const fd = new FormData()
      fd.append('delivery_assignment_id', assignmentId)
      fd.append('kind', kind)
      fd.append('amount', String(amt))
      if (file) fd.append('file', file)
      const res = await fetch(`/api/console/deals/${selected.id}/expenses`, { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.expense) { await refreshDeals(selected.id); showToast('経費を申請しました') }
      else if (data.needsMigration) showToast('経費のDB適用が必要です（batchA2b DDL）')
      else showToast(data.error ?? '申請に失敗しました')
    } catch { showToast('申請に失敗しました') } finally { setItemBusy(false) }
  }
  // A2b: 経費の承認/却下/差戻し。承認＝approved のみ粗利に算入。
  async function setExpenseStatus(expId: string, status: 'approved' | 'rejected' | 'submitted') {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/expenses/${expId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.expense) { await refreshDeals(selected.id); showToast(status === 'approved' ? '承認しました' : status === 'rejected' ? '却下しました' : '差戻しました') }
      else showToast(data.error ?? '更新に失敗しました')
    } catch { showToast('更新に失敗しました') } finally { setItemBusy(false) }
  }
  async function deleteExpense(expId: string) {
    if (!selected || !confirm('この経費を削除しますか？（領収書も削除されます）')) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/expenses/${expId}`, { method: 'DELETE' })
      if (res.ok) { await refreshDeals(selected.id); showToast('削除しました') } else showToast('削除に失敗しました')
    } catch { showToast('削除に失敗しました') } finally { setItemBusy(false) }
  }
  // A2b: 領収書を短期署名URLで開く（バケットは非公開のまま）。
  async function viewEvidence(expId: string) {
    try {
      const res = await fetch(`/api/console/expenses/${expId}/evidence`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.url) window.open(data.url, '_blank', 'noopener')
      else showToast(data.error ?? '領収書を開けません')
    } catch { showToast('領収書を開けません') }
  }

  function updateStatus(deal: Deal, newStatus: Status) {
    // ② Confirming a rate-based deal without a recorded base → ask for the actual amount first.
    if (newStatus === 'confirmed' && needsBase(deal)) {
      const ri = rateInfo(deal)
      setBaseInput('')
      setBaseModal({ deal, rate: ri.rate as number, baseLabel: ri.baseLabel })
      return
    }
    // N: 不成立化は理由入力を挟む（直接PATCHしない）
    if (newStatus === 'lost') {
      if (deal.status === 'paid') { showToast('支払済の案件は不成立にできません'); return }
      setLostReason(''); setLostNote(''); setLostModal(deal)
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
        if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: newStatus } : d)
        showToast(`ステータスを「${COLS.find(c => c.key === newStatus)?.label}」に変更しました`)
      } else if (data?.needsBase) {
        // Fallback: server says base required (e.g. stale client data)
        setBaseInput('')
        setBaseModal({ deal, rate: Number(data.rate), baseLabel: data.baseLabel ?? '売上' })
      } else {
        showToast(data?.error ?? '更新に失敗しました')
      }
    })
  }

  function confirmWithBase() {
    if (!baseModal) return
    const base = Number(baseInput.replace(/[,，\s]/g, ''))
    if (!base || Number.isNaN(base) || base <= 0) { showToast('実額を正しく入力してください'); return }
    const { deal, rate } = baseModal
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'confirmed', base_amount: base }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const computed = Math.round(base * rate / 100)
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: 'confirmed', base_amount: base, amount: computed } : d))
        if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: 'confirmed', base_amount: base, amount: computed } : d)
        setBaseModal(null)
        showToast(`成約確定：報酬 ¥${computed.toLocaleString()}`)
      } else {
        showToast(data?.error ?? '確定に失敗しました')
      }
    })
  }

  // ① Save/edit the actual amount (base) from the detail panel — reward recomputes.
  function saveBase() {
    if (!selected) return
    const ri = rateInfo(selected)
    const base = Number(baseEdit.replace(/[,，\s]/g, ''))
    if (!base || Number.isNaN(base) || base <= 0) { showToast('実額を正しく入力してください'); return }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_amount: base }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const computed = Math.round(base * (ri.rate as number) / 100)
        setDeals(prev => prev.map(d => d.id === selected.id ? { ...d, base_amount: base, amount: computed } : d))
        setSelected(s => s ? { ...s, base_amount: base, amount: computed } : s)
        setEditingBase(false)
        showToast(`実績金額を保存：報酬 ¥${computed.toLocaleString()}`)
      } else {
        showToast(data?.error ?? '保存に失敗しました')
      }
    })
  }

  // N: 不成立化を確定（理由＋メモ）。報酬は成功報酬制のため変更しない。
  function confirmLost() {
    if (!lostModal) return
    const deal = lostModal
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'lost', lost_reason: lostReason || null, lost_note: lostNote.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const patch = { status: 'lost', lost_reason: lostReason || null, lost_note: lostNote.trim() || null, lost_at: new Date().toISOString() }
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...patch } : d))
        if (selected?.id === deal.id) setSelected(s => s ? { ...s, ...patch } : s)
        setLostModal(null)
        showToast('案件を「不成立」にしました')
      } else {
        showToast(data?.error ?? '更新に失敗しました')
      }
    })
  }

  // N: 不成立から「対応中に戻す（再開）」。lost_* はサーバー側でクリア。
  function reopenDeal(deal: Deal) {
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const patch = { status: 'in_progress', lost_reason: null, lost_note: null, lost_at: null }
        setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, ...patch } : d))
        if (selected?.id === deal.id) setSelected(s => s ? { ...s, ...patch } : s)
        showToast('案件を「対応中」に戻しました')
      } else {
        showToast(data?.error ?? '更新に失敗しました')
      }
    })
  }

  // A3: 取り消しの確認は cancelConfirm ダイアログに一本化（window.confirm廃止）。実行本体は不変（DELETE→一覧から除去）。
  function cancelDeal(deal: Deal) {
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, { method: 'DELETE' })
      if (res.ok) {
        setDeals(prev => prev.filter(d => d.id !== deal.id))
        setSelected(null)
        showToast('案件を取り消しました')
      }
    })
  }

  // D&D handlers
  function onDragStart(deal: Deal) {
    dragItem.current = { id: deal.id, status: deal.status }
  }
  function onDragOver(e: React.DragEvent, colKey: string) {
    e.preventDefault()
    setDragOverCol(colKey)
  }
  function onDragLeave(e: React.DragEvent) {
    // only clear if leaving the column entirely (not moving to a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null)
    }
  }
  // F-3a: レーン（商談=status／プロジェクト=project_status）へのドロップ。お金フローは既存処理を流用。
  function onDrop(e: React.DragEvent, targetLaneKey: string) {
    e.preventDefault()
    setDragOverCol(null)
    const src = dragItem.current
    if (!src) return
    const deal = deals.find(d => d.id === src.id)
    if (!deal) return
    const lane = PIPELINE_LANES.find(l => l.key === targetLaneKey)
    if (!lane || laneKeyOf(deal) === targetLaneKey) { dragItem.current = null; return }
    const srcPhase = deal._phase ?? phaseOf(deal)
    if (lane.group === 'shodan') {
      if (srcPhase === 'project') { showToast('プロジェクトの案件は商談へ戻せません'); dragItem.current = null; return }
      requestStatusMove(deal, lane.key as Status)         // 受付↔商談中（既存処理＋実装2の結果予告）
    } else if (srcPhase === 'shodan') {
      if (lane.key === '未着手') requestStatusMove(deal, 'confirmed')   // 成約フロー（base/報酬は既存処理＋実装2の結果予告）
      else showToast(`先に「${DEAL_STATUS.confirmed.label}」へ移動して成約してください`)
    } else {
      // 実装2: project間は波及なし（3面表示・メール不変）＝即時実行＋Undoトースト8秒。
      const undoFrom = deal.project_status ?? '未着手'
      setProjectStatusForDeal(deal, lane.key, { undoFrom, laneLabel: lane.label })
    }
    dragItem.current = null
  }
  // 実装2: status遷移のドロップは、波及(ripple＝3面表示変化 or メール送信)があれば確定前に結果予告モーダルを挟む。
  //   波及なしの遷移（理論上のみ）は従来どおり即時。「移動する」後は従来の updateStatus（confirmed の baseModal/lostModal 分岐も生きる）。
  function requestStatusMove(deal: Deal, to: Status) {
    if (transitionForecast(deal.status, to).ripple) setMoveConfirm({ deal, to })
    else updateStatus(deal, to)
  }

  // F-3a: フィルタ群（サービス・流入経路・フェーズ・MB担当・パートナー）を合成。
  const filteredDeals = deals.filter(d => {
    if (filterSvc !== 'all' && d.service_id !== filterSvc) return false
    if (filterIntake !== 'all' && (d.intake_type ?? 'referral_coop') !== filterIntake) return false
    if (filterPhase !== 'all' && (d._phase ?? phaseOf(d)) !== filterPhase) return false
    if (filterDirector !== 'all' && (d.director_id ?? '') !== filterDirector) return false
    if (filterPartner !== 'all' && (d.partners?.code ?? '') !== filterPartner) return false
    return true
  })
  // パートナー絞り込みの選択肢（直営業=MB直営は裏方のため除外）。
  const partnerOpts = Array.from(new Map(
    deals.filter(d => (d.intake_type ?? 'referral_coop') !== 'direct' && d.partners?.profiles)
      .map(d => [d.partners!.code, d.partners!.profiles!.name])
  ).entries())

  // 実装1: ボードに載る案件（アクティブのみ）。各レーンの絞り込みで共用。
  // 静音化v2(C): 写像の常時表示（firstOpenProjectLaneKey）は撤去＝ホバー/クリックのMappingTipへ退避。
  const boardDeals = filteredDeals.filter(d => !['paid', 'lost'].includes(d.status))

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230, padding: '30px 32px' }} aria-busy="true">
        <div className="ui-skeleton" style={{ height: 28, width: 200, marginBottom: 22 }} />
        <div style={{ display: 'flex', gap: 14 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="ui-skeleton" style={{ width: 256, height: 220, borderRadius: 16 }} />)}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ flex: 1 }}>
            <p className="eyebrow" style={{ marginBottom: 2 }}>案件管理</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <h1 style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1 }}>{view === 'board' ? '案件ボード' : 'アーカイブ'}</h1>
              {/* 実装3: ステータスマトリクス（3面写像＋通知メール）を開くⓘ（SVG・絵文字不使用） */}
              {view === 'board' && (
                <button onClick={() => setMatrixOpen(true)} title="ステータスと3面の表示" aria-label="ステータスと3面の表示を開く"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="11" x2="12" y2="16" />
                    <circle cx="12" cy="7.6" r="0.5" fill="currentColor" stroke="none" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* QR: ボード / アーカイブ 切替 */}
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3 }}>
            {([['board', 'ボード'], ['archive', 'アーカイブ']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} style={{
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500,
                padding: '7px 14px', borderRadius: 7,
                color: view === v ? 'var(--txt)' : 'var(--muted2)',
                background: view === v ? '#fff' : 'transparent',
                boxShadow: view === v ? '0 1px 4px rgba(14,14,20,.1)' : 'none',
              }}>
                {lbl}{v === 'archive' ? ` (${deals.filter(d => d.status === 'paid' || d.status === 'lost').length})` : ''}
              </button>
            ))}
          </div>

          {/* Service filter */}
          <select
            value={filterSvc}
            onChange={e => setFilterSvc(e.target.value)}
            style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 12px', fontFamily: 'inherit', fontSize: '.76rem', background: '#fff', color: 'var(--txt)', cursor: 'pointer' }}
          >
            <option value="all">全サービス ({deals.length}件)</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({deals.filter(d => d.service_id === s.id).length}件)</option>
            ))}
          </select>

          {/* F-3a: 直営業プロジェクト起票（商談を経ず MB直営・確定で起票）。パートナー経由の商談起票は従来どおり別導線。 */}
          <Button variant="primary" size="sm" onClick={() => setDirectModal(true)} style={{ whiteSpace: 'nowrap' }}>＋ 直営業プロジェクト</Button>
        </div>

        {/* F-3a: フィルタバー（ボードのみ）。流入経路・フェーズ・MB担当・パートナーで絞り込み。 */}
        {view === 'board' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 32px 0' }}>
            {([
              ['流入経路', filterIntake, setFilterIntake, [['all', 'すべて'], ['referral_coop', 'パートナー経由'], ['direct', '直営業']]],
              ['フェーズ', filterPhase, setFilterPhase, [['all', 'すべて'], ['shodan', '商談'], ['project', 'プロジェクト']]],
            ] as const).map(([label, val, setter, opts]) => (
              <select key={label} value={val} onChange={e => setter(e.target.value)} aria-label={label}
                style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', color: 'var(--txt)', cursor: 'pointer' }}>
                {opts.map(([v, l]) => <option key={v} value={v}>{label}：{l}</option>)}
              </select>
            ))}
            <select value={filterDirector} onChange={e => setFilterDirector(e.target.value)} aria-label="MB担当"
              style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', color: 'var(--txt)', cursor: 'pointer' }}>
              <option value="all">MB担当：すべて</option>
              {directors.map(d => <option key={d.id} value={d.id}>MB担当：{d.name}</option>)}
            </select>
            <select value={filterPartner} onChange={e => setFilterPartner(e.target.value)} aria-label="パートナー"
              style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', color: 'var(--txt)', cursor: 'pointer' }}>
              <option value="all">パートナー：すべて</option>
              {partnerOpts.map(([code, name]) => <option key={code} value={code}>パートナー：{name}</option>)}
            </select>
            {(filterIntake !== 'all' || filterPhase !== 'all' || filterDirector !== 'all' || filterPartner !== 'all' || filterSvc !== 'all') && (
              <Button variant="secondary" size="sm" onClick={() => { setFilterIntake('all'); setFilterPhase('all'); setFilterDirector('all'); setFilterPartner('all'); setFilterSvc('all') }}>クリア</Button>
            )}
          </div>
        )}

        {view === 'archive' ? (
          /* QR: アーカイブ＝支払済＋不成立（検索/サービスフィルタ可）。再開・入金確認はここから。 */
          <div style={{ padding: '24px 32px' }}>
            <input
              value={archiveSearch}
              onChange={e => setArchiveSearch(e.target.value)}
              placeholder="お客さま名で検索…"
              className="ui-field"
              style={{ maxWidth: 360, fontSize: '.8rem', marginBottom: 16 }}
            />
            {(() => {
              const arch = filteredDeals
                .filter(d => d.status === 'paid' || d.status === 'lost')
                .filter(d => !archiveSearch.trim() || customerHonorific(d).toLowerCase().includes(archiveSearch.trim().toLowerCase()))
              if (arch.length === 0) return <EmptyState title="該当する案件がありません" compact />
              return (
                <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                  {arch.map((d, i) => (
                    <div key={d.id} onClick={() => setSelected(d)} className="lift" style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer',
                      borderBottom: i < arch.length - 1 ? '0.5px solid var(--line)' : 'none',
                    }}>
                      {d.services && <ServiceAvatar logoPath={(d.services as any).logo_path ?? null} icon={d.services.icon} color={d.services.color} name={d.services.name} size={28} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.78rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</div>
                        <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>
                          {d.services?.name}{menuLabelOf(d) ? ` ─ ${menuLabelOf(d)}` : ''}{d.status === 'lost' && d.lost_reason ? ` ・ 理由: ${lostReasonLabel(d.lost_reason)}` : ''}
                        </div>
                      </div>
                      <ChannelMark channel={d.channel} showLabel={false} />
                      {/* v2.2：ステータスは6pxドット＋テキスト（塗りピル廃止・色は --st-* 意味色） */}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[d.status]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                        <span style={{ fontSize: '.6rem', fontWeight: 400, color: 'var(--muted2)' }}>{d.status === 'paid' ? '支払済' : '不成立'}</span>
                      </span>
                      {d.status === 'paid' && d.amount > 0 && (
                        <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 500, color: 'var(--muted2)' }}>¥{d.amount.toLocaleString()}</span>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        ) : (
        <div style={{ padding: '18px 0 28px' }}>
          {/* F-3a: フェーズ×ステータスのパイプライン。左→右で 商談(受付→商談中)→成約→プロジェクト(未着手→納品完了)。
              直営業は商談を飛ばしプロジェクト列に出現。レーン間ドラッグ：商談=status変更／成約=既存の成約フロー／プロジェクト間=project_status変更（お金非干渉）。 */}
          {/* 静音化v2.1(A4): ゾーン見出し＝PHASE_LABEL正典（商談/プロジェクト）から導出・11px/muted 1行。
              ゾーン間ガター24px・レーン間12px。projectの3面写像ツールチップ（MappingTip）はゾーン見出しに1回のみ。
              静音化v2.1(A3): 空レーンの畳み機構は撤去＝通常ヘッダ＋件数0で常時表示。 */}
          <div className="page-anim" style={{ display: 'flex', gap: 24, alignItems: 'flex-start', overflowX: 'auto', padding: '0 32px 10px' }}>
            {(['shodan', 'project'] as const).map(group => (
              <div key={group} style={{ flexShrink: 0 }}>
                <div style={{ marginBottom: 8, paddingLeft: 2 }}>
                  {group === 'project' ? (
                    <MappingTip partner={projectLaneTranslation().partner} vendor={projectLaneTranslation().vendor}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', cursor: 'default' }}>{PHASE_LABEL.project}</span>
                    </MappingTip>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em' }}>{PHASE_LABEL.shodan}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {PIPELINE_LANES.filter(l => l.group === group).map(lane => {
                    const laneDeals = boardDeals.filter(d => laneKeyOf(d) === lane.key)
                    return (
                  <div
                    key={lane.key}
                    onDragOver={e => onDragOver(e, lane.key)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, lane.key)}
                    style={{ width: 256, flexShrink: 0, background: 'var(--bg2)', borderRadius: 16, padding: 14, minHeight: 220, border: `0.5px solid ${dragOverCol === lane.key ? 'var(--c-blue)' : 'var(--line)'}`, transition: 'border-color .15s var(--ease-out)' }}
                  >
                    {/* 静音化v2(C): レーンヘッダ＝ステータス名14px/500＋件数muted のみ（グループ極小ラベルはA4ゾーン見出しへ一本化）。
                        写像は常時表示せず MappingTip（hover/クリック）へ退避＝shodanはレーン名、projectはゾーン見出しに1回。 */}
                    <div style={{ marginBottom: 12, padding: '2px 2px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${lane.tone})`, flexShrink: 0 }} />
                        {lane.group === 'shodan' ? (
                          <MappingTip partner={statusTranslation(lane.key).partner} vendor={statusTranslation(lane.key).vendor}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap', cursor: 'default' }}>{lane.label}</span>
                          </MappingTip>
                        ) : (
                          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{lane.label}</span>
                        )}
                      </div>
                      <span className="tnum" style={{ fontSize: '.7rem', fontWeight: 400, color: 'var(--muted2)', flexShrink: 0 }}>{laneDeals.length}</span>
                    </div>

                    {laneDeals.map(d => {
                      // BR-C3: 最小・均一カード。表示は 案件名 / パートナー名(経由時のみ) / MB担当 / デリバリー。
                      //   種別・ステージ・フェーズ・ステータスは載せない（レーンで分かる）。詳細は案件詳細へ。
                      const intake = d.intake_type ?? 'referral_coop'
                      const partnerName = intake !== 'direct' && d.partners?.profiles ? d.partners.profiles.name : null
                      const partnerKindLabel = engagementLabel(d.channel)   // 区分語は空（direct のみ）
                      const directorName = d.director_id ? (directors.find(x => x.id === d.director_id)?.name ?? null) : null
                      const deliveryName = (d._deliveries ?? []).find(a => a.delivery_id)?.deliveries?.name ?? null
                      const rejectedExp = (d._deliveries ?? []).some(a => (a._expenses ?? []).some(e => e.status === 'rejected'))
                      const revenueMissing = (d._phase ?? phaseOf(d)) === 'project' && (d.deal_items?.length ?? 0) > 0 && (d.deal_items ?? []).every(it => it.revenue == null)
                      // 静音化v2.1(A1): 要対応＝テキストピル廃止→カード右上7px赤丸（理由は判定根拠から導出しtitleへ）。
                      const attentionReasons = [
                        needsBase(d) && '実績金額が未入力',
                        rejectedExp && '却下された経費があります',
                        revenueMissing && '受注額（売上）が未入力',
                      ].filter(Boolean) as string[]
                      {/* 静音化v2(C): カード2行文法＝名前13px/500＋「ブランド ─ メニュー」11px/muted。担当/委託は3行目11px。詳細はドロワーが語る。 */}
                      const brandMenu = [d.services?.name, menuLabelOf(d)].filter(Boolean).join(' ─ ')
                      const sub = [directorName && `担当 ${directorName}`, partnerName && `${partnerKindLabel ? partnerKindLabel + ' ' : ''}${partnerName}`, deliveryName && `委託 ${deliveryName}`].filter(Boolean).join('・')
                      return (
                        <div
                          key={d.id}
                          draggable
                          onDragStart={() => onDragStart(d)}
                          onClick={() => setSelected(d)}
                          className="card-hover ui-card"
                          style={{ position: 'relative', background: 'var(--s-0)', border: '0.5px solid var(--line)', borderRadius: 13, padding: '10px 12px', marginBottom: 8, cursor: 'grab', boxShadow: selected?.id === d.id ? '0 0 0 2px var(--c-blue)' : undefined, userSelect: 'none', minHeight: 66, overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}
                        >
                          {attentionReasons.length > 0 && (
                            <span title={`要対応: ${attentionReasons.join('・')}`} style={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {d.services
                              ? <ServiceAvatar logoPath={(d.services as any).logo_path ?? null} icon={d.services.icon} color={d.services.color} name={d.services.name} size={24} />
                              : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={24} />}
                            <b style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{customerHonorific(d)}</b>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brandMenu || '—'}</div>
                          {sub && <div style={{ fontSize: 11, color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
                        </div>
                      )
                    })}
                  </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* Detail panel — 静音化v2: ヘッダ1行＋動詞CTA1つ＋本体2カラム（進行1.5：お客さま1・0.5px縦罫線・カード枠なし） */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
          {/* 狭幅（375px相当）では1カラム＝従来の縦スクロールに落とす（コンソールはPC前提・破綻回避のみ） */}
          <style>{`@media (max-width: 640px){ .deal-drawer-body{ grid-template-columns: 1fr !important } .deal-drawer-right{ border-left: none !important } } @keyframes manage-menu-in{from{opacity:0}to{opacity:1}}`}</style>
          <div style={{ position: 'fixed', top: 0, right: 0, width: 720, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '0.5px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)' }}>
            {/* A1: ヘッダ1行 — ロゴ36px＋お客さま名16px/500＋「ブランド ─ メニュー」12px/muted。右にステータス（7pxドット＋語・dealStatus正典）＋報酬ピル＋✕ */}
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
              {selected.services
                ? <ServiceAvatar logoPath={(selected.services as any).logo_path ?? null} icon={selected.services.icon} color={selected.services.color} name={selected.services.name} size={36} />
                : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={36} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(selected)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selected.services?.name ? `${selected.services.name}${menuLabelOf(selected) ? ` ─ ${menuLabelOf(selected)}` : ''}` : '相談（サービス未定）'}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[selected.status]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{DEAL_STATUS[selected.status]?.label ?? selected.status}</span>
              </span>
              {selected.amount > 0 && <RewardPill><span className="tnum" style={{ fontFamily: 'Inter' }}>¥{selected.amount.toLocaleString()}</span></RewardPill>}
              {/* A3: 「…」管理メニュー（旧ドロワー下部の赤字テキスト2つから移設）。paid/lost は既存ガード踏襲で非活性。
                  lost=可逆（記録が残る・不成立メール1通）／取消=不可逆（痕跡ゼロ・通知なし）＝別操作のまま統合しない。 */}
              <div ref={manageRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setManageOpen(o => !o)} aria-label="管理メニューを開く" aria-expanded={manageOpen}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
                {manageOpen && (() => {
                  const locked = selected.status === 'paid' || selected.status === 'lost'
                  const item = (label: string, onClick: () => void) => (
                    <button onClick={() => { setManageOpen(false); onClick() }} disabled={locked || pending}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderRadius: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: locked ? 'var(--muted)' : 'var(--red)', cursor: locked ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                      {label}
                    </button>
                  )
                  return (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 28px rgba(14,14,20,.14)', padding: 4, minWidth: 148, animation: 'manage-menu-in 120ms var(--ease-out)' }}>
                      {item('不成立にする', () => updateStatus(selected, 'lost'))}
                      {item('案件を取り消す', () => setCancelConfirm(selected))}
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>

            {/* A2: 焦点＝動詞ボタン1つ（OPS_NEXT_ACTION正典由来・枠/見出し/常設予告なし）。
                押下→確認ダイアログ（forecastLine＋precondition・実行する/キャンセル）→updateStatus（既存ガードは関数内で活きる）。
                特殊分岐: 明細0→金額・原価を展開しスクロール／率base未入力→実績金額入力へ／lost90日内→再開／paid→非表示（ステータス行が完了を語る）。 */}
            {(() => {
              const st = selected.status
              const noItems = (selected.deal_items?.length ?? 0) === 0
              const nextAct = OPS_NEXT_ACTION[st as keyof typeof OPS_NEXT_ACTION] ?? null
              let act: { label: string; onClick: () => void } | null = null
              if (st === 'in_progress' && noItems) {
                act = { label: '明細を追加して成約へ', onClick: openMoneySection }
              } else if (st === 'in_progress' && needsBase(selected)) {
                act = { label: '実績金額を入力して成約へ', onClick: () => openBaseEntry(selected) }
              } else if (nextAct) {
                act = { label: nextAct.cta, onClick: () => setCtaConfirm({ deal: selected, to: nextAct.to, from: st, precondition: nextAct.precondition }) }
              } else if (st === 'lost') {
                const days = selected.lost_at ? Math.floor((Date.now() - new Date(selected.lost_at).getTime()) / 86_400_000) : null
                if (days != null && days <= 90) act = { label: '案件を再開する', onClick: () => setCtaConfirm({ deal: selected, to: 'in_progress', from: 'lost', reopen: true }) }
              }
              if (!act) return null
              return (
                <div style={{ padding: '12px 22px', borderBottom: '0.5px solid var(--line)' }}>
                  <button onClick={act.onClick} disabled={pending} className="ui-btn ui-btn--primary" style={{ fontSize: 13, padding: '9px 18px' }}>
                    {act.label}
                  </button>
                </div>
              )
            })()}

            {/* A3: 本体2カラム（左「進行」1.5：右「お客さま」1・間0.5px縦罫線・カード枠なし・等圧入れ子禁止） */}
            <div className="cascade deal-drawer-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)' }}>
              <div style={{ padding: '18px 22px', minWidth: 0 }}>
              <SectionLabel first>進行</SectionLabel>

              {/* 縦タイムライン（受付→対応中→成約→支払済／lostは不成立終端・理由つき）。登録日＝受付の日時。 */}
              <StatusTimeline deal={selected} />

              {/* F-1: プロジェクト実行ステータス（お金に非干渉の独立メタデータ・プロジェクト段階のみ）。
                  A2: フェーズ/流入チップは撤去＝ボードのゾーン・レーンが語る。
                  静音化v2: 保存結果の説明サブテキストは常設せず title属性へ退避。 */}
              {(() => {
                const phase = selected._phase ?? phaseOf(selected)
                if (phase !== 'project') return null
                return (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 500 }}>プロジェクト状態</span>
                      <select value={selected.project_status ?? ''} disabled={itemBusy} title="社内管理・パートナー/デリバリーには表示されません"
                        onChange={e => saveProjectStatus(e.target.value === '' ? null : e.target.value)}
                        style={{ border: '0.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: '.72rem', fontWeight: 500, background: '#fff', color: PROJECT_STATUS_STYLE[selected.project_status ?? '']?.c ?? 'var(--txt)' }}>
                        <option value="">未設定</option>
                        {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {/* 静音化v2.1(B3): 稟議ステージselectは概念廃止＝撤去（API/DB列は残置・到達不能） */}
                  </div>
                )
              })()}

              {/* P: 報酬ゲート判定（協力で必須タスク未達→紹介レート）— 枠なしテキスト（表示専用・判定不変） */}
              {selected.channel === 'cooperation' && selected.reward_snapshot?.gate_reason && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--amber)' }}>対応範囲が未達のため、固定報酬で確定</p>
                  <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.6 }}>{selected.reward_snapshot.gate_reason}</p>
                </div>
              )}
              {selected.channel === 'cooperation' && selected.reward_snapshot?.effective_kind === 'cooperation' && (
                <p style={{ marginTop: 14, fontSize: '.64rem', fontWeight: 500, color: 'var(--green)' }}>対応範囲をすべて満たし、成果報酬（粗利%）で確定</p>
              )}

              {/* ④ 対応範囲（協力タスク）の管理側チェック：運営が確認して done を立てる（必須全達成→協力レート確定の入力）。
                  静音化v2: カード枠・常設説明文なし＝0.5px罫線と余白のみ。 */}
              {selected.channel === 'cooperation' && dealTasks.length > 0 && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                  <p style={{ fontSize: '.66rem', fontWeight: 500, marginBottom: 6 }}>対応範囲</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[...dealTasks].sort((a, b) => a.sort - b.sort).map(t => {
                      const auto = t.kind !== 'manual'
                      return (
                        <button key={t.id} type="button" onClick={() => !auto && toggleDealTask(t.id, !t.done)} disabled={auto || taskBusy === t.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', background: 'none', border: 'none', borderBottom: '0.5px solid var(--line)', textAlign: 'left', width: '100%', cursor: auto ? 'default' : 'pointer', opacity: taskBusy === t.id ? .6 : 1, fontFamily: 'inherit' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.done ? 'var(--green)' : '#fff', border: `2px solid ${t.done ? 'var(--green)' : 'var(--line)'}`, color: '#fff' }}>
                            {t.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, color: t.done ? 'var(--muted2)' : 'var(--txt)', textDecoration: t.done ? 'line-through' : 'none' }}>
                            {t.label}
                            {/* A3: パートナー入力のヒアリング内容（deal_tasks.note）— 保存はされていたが表示欠落だった */}
                            {t.note && (
                              <span style={{ display: 'block', fontSize: '.66rem', fontWeight: 400, color: 'var(--txt)', textDecoration: 'none', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 8 }}>{t.note}</span>
                            )}
                          </span>
                          {t.required && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '1px 7px' }}>必須</span>}
                          {auto && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 500, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '1px 7px' }}>自動</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ① 実績金額（率案件）— 編集（base_amount→報酬再計算は不変）。静音化v2: 枠なし・0.5px罫線区切り。 */}
              {rateInfo(selected).isRate && (
                <div ref={baseBoxRef} style={{ marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>実績金額（{rateInfo(selected).baseLabel}）</p>
                      <p style={{ fontSize: '.88rem', fontWeight: 500, fontFamily: 'Inter', marginTop: 3 }}>
                        {selected.base_amount != null
                          ? `¥${selected.base_amount.toLocaleString()}`
                          : <span style={{ color: 'var(--amber)', fontSize: '.74rem' }}>未入力</span>}
                      </p>
                      <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 3 }}>
                        × {rateInfo(selected).rate}% = 報酬 {selected.amount > 0 ? `¥${selected.amount.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    {!editingBase && selected.status !== 'lost' && (
                      <button onClick={() => { setEditingBase(true); setBaseEdit(selected.base_amount?.toString() ?? '') }} className="ui-btn ui-btn--secondary" style={{ fontSize: '.7rem', padding: '7px 12px', flexShrink: 0 }}>
                        {selected.base_amount != null ? '金額を編集' : '金額を入力'}
                      </button>
                    )}
                  </div>
                  {editingBase && (
                    <div style={{ marginTop: 12 }}>
                      <input
                        autoFocus inputMode="numeric"
                        value={baseEdit}
                        onChange={e => setBaseEdit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveBase() }}
                        placeholder={`${rateInfo(selected).baseLabel}の実額（例：300000）`}
                        style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'Inter', fontSize: '.85rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', fontSize: '.72rem' }}>
                        <span style={{ color: 'var(--muted2)' }}>確定報酬（{rateInfo(selected).rate}%）</span>
                        <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)' }}>
                          {(() => { const bv = Number(baseEdit.replace(/[,，\s]/g, '')); return bv > 0 ? `¥${Math.round(bv * (rateInfo(selected).rate as number) / 100).toLocaleString()}` : '—' })()}
                        </b>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingBase(false)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.7rem', padding: '7px 12px' }}>キャンセル</button>
                        <button onClick={saveBase} disabled={pending} className="ui-btn ui-btn--primary" style={{ fontSize: '.7rem', padding: '7px 14px' }}>保存する</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 継続報酬：月次入力セクション（継続案件のみ・通常案件には出さない）【進行セクション】 */}
              {continuousInfo(selected).isContinuous && (
                <ContinuousMonthly deal={selected} onChanged={() => refreshDeals(selected.id)} />
              )}

              {/* N: 不成立の詳細（理由/メモ/日時）はタイムライン終端項目へ・再開（90日内）はヘッダCTA「案件を再開する」へ再配置。 */}

              {/* 管理操作 — ←戻すのみ（A3: 不成立にする/案件を取り消すはヘッダ「…」メニューへ移設）。
                  戻すは押下時ダイアログ（ctaConfirm=forecastLine）。ハンドラ不変。 */}
              {selected.status !== 'lost' && PREV[selected.status] && (
                <div style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                  <SectionLabel first>管理操作</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                    {(() => {
                      const to = PREV[selected.status]!
                      return (
                        <button onClick={() => setCtaConfirm({ deal: selected, to, from: selected.status })} disabled={pending} title={forecastLine(selected.status, to)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--muted2)' }}>
                          ← {COLS.find(c => c.key === to)?.label}に戻す
                        </button>
                      )
                    })()}
                  </div>
                </div>
              )}
              </div>

              {/* 右カラム「お客さま」— 連絡先・基本情報・ヒアリング・最下部に金額・原価（需要時表示） */}
              <div className="deal-drawer-right" style={{ padding: '18px 22px', minWidth: 0, borderLeft: '0.5px solid var(--line)' }}>
              <SectionLabel first>お客さま</SectionLabel>

              {/* 連絡先（customer_email・コピー可）。dealsにphone列は無いため電話はデータがある場合のみ＝現状省略。 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {selected.customer_email ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{selected.customer_email}</span>
                    <button onClick={() => { const v = selected.customer_email!; navigator.clipboard?.writeText(v).then(() => showToast('メールアドレスをコピーしました')).catch(() => {}) }}
                      title="コピー" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 500, color: 'var(--c-blue)', flexShrink: 0 }}>
                      コピー
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted2)' }}>—</span>
                )}
              </div>

              {/* 基本情報（表示専用）: サービス/ステータス/報酬/登録日はヘッダ・タイムラインへ再配置済＝ここは残余メタのみ */}
              <div style={{ marginTop: 12 }}>
                {([
                  ['ソース', selected.source],
                  ['パートナー', selected.partners ? `${selected.partners.profiles?.name ?? ''} (${selected.partners.code})` : '—'],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  </div>
                ))}
                {/* 静音化v2.1(B2): MB担当＝担当情報として常時可視（金額・原価の折りたたみから移設）。保存はsavePnl（楽観更新つき）。 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', flexShrink: 0 }}>MB担当</span>
                  <select value={selected.director_id ?? ''} onChange={e => savePnl({ director_id: e.target.value || null })} disabled={itemBusy}
                    style={{ border: '0.5px solid var(--line)', borderRadius: 8, padding: '5px 9px', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, background: '#fff', color: 'var(--txt)', minWidth: 0, maxWidth: 180 }}>
                    <option value="">未割当</option>
                    {directors.map(d => <option key={d.id} value={d.id}>{d.name}（{d.role}）</option>)}
                  </select>
                </div>
                {selected.contact_title && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>部署・役職</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.contact_title}</span>
                  </div>
                )}
              </div>

              {/* ヒアリング（協力タスクのヒアリングnote。無ければ「—」） */}
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', margin: '18px 0 8px' }}>ヒアリング</p>
              {(() => {
                const notes = dealTasks.filter(t => t.note && t.note.trim()).map(t => t.note!.trim())
                if (notes.length === 0) return <p style={{ fontSize: 12, color: 'var(--muted2)' }}>—</p>
                return notes.map((n, i) => (
                  <p key={i} style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: i > 0 ? '8px 0 0' : 0 }}>{n}</p>
                ))
              })()}

              {/* A3: 金額・原価 — 需要時表示（received/in_progress=クリック展開・confirmed/paid/lostは自動展開＝フェーズ連動）。
                  展開内容＝既存の明細CRUD/デリバリー割当/経費/P&L/明細追加/DeliveryProgress一式（枠なし0.5px区切り）。 */}
              <div ref={moneyRef} style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
              {(() => {
                const items = selected.deal_items ?? []
                // 完成D: 直営業（intake=direct）は商談を経ず confirmed で起票されるため、confirmed中はmoney編集可
                //   （API側 deliveries ロック緩和と同条件。paid後はロック。パートナー報酬はMB直営=is_system＝支払対象外）。
                const editable = ['received', 'in_progress'].includes(selected.status)
                  || (selected.intake_type === 'direct' && selected.status === 'confirmed')
                const svc = svcMenus.find(s => s.id === itemForm.service_id)
                const autoOpen = !['received', 'in_progress'].includes(selected.status)
                const opened = moneyOpen || autoOpen
                const renderMoney = () => (<>
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500, marginBottom: 6 }}>明細（内訳）</p>
                    <div>
                      {items.length === 0 && <p style={{ padding: '10px 0', fontSize: '.66rem', color: 'var(--muted2)' }}>明細はまだありません</p>}
                      {[...items].sort((a, b) => a.sort - b.sort).map(it => (
                        <div key={it.id} style={{ padding: '10px 0', borderBottom: '0.5px solid var(--line)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.services?.name ?? it.service_id}</div>
                              <div style={{ fontSize: '.56rem', color: 'var(--muted2)', marginTop: 1 }}>
                                {it.kind === 'rate' ? `率・実績 ${it.base_amount != null ? `¥${it.base_amount.toLocaleString()}` : '未入力'}` : '固定'} ・ 報酬
                              </div>
                            </div>
                            {editable && it.kind === 'rate' && (
                              <input key={`${selected.id}:${it.id}:base`} defaultValue={it.base_amount ?? ''} inputMode="numeric" placeholder="実績" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.base_amount ?? '')) patchItem(it.id, { base_amount: v === '' ? null : Number(v) }) }}
                                style={{ width: 78, border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.7rem', textAlign: 'right' }} />
                            )}
                            {editable && it.kind === 'fixed' && !it.menu_id && (
                              <input key={`${selected.id}:${it.id}:amount`} defaultValue={it.amount ?? ''} inputMode="numeric" placeholder="報酬" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.amount ?? '')) patchItem(it.id, { amount: v === '' ? 0 : Number(v) }) }}
                                style={{ width: 78, border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.7rem', textAlign: 'right' }} />
                            )}
                            <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 500, minWidth: 58, textAlign: 'right', color: it.amount > 0 ? 'var(--txt)' : 'var(--muted)' }}>
                              {it.amount > 0 ? `¥${it.amount.toLocaleString()}` : '—'}
                            </span>
                            {editable && (
                              <button onClick={() => deleteItem(it.id)} disabled={itemBusy} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.8rem' }}>✕</button>
                            )}
                          </div>
                          {/* A1: 受注額（売上）— 成約前のみ編集 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <span style={{ fontSize: '.58rem', color: 'var(--muted2)', flex: 1 }}>受注額（売上）</span>
                            {editable ? (
                              <input key={`${selected.id}:${it.id}:revenue`} defaultValue={it.revenue ?? ''} inputMode="numeric" placeholder="売上" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.revenue ?? '')) patchItem(it.id, { revenue: v === '' ? null : Number(v) }) }}
                                style={{ width: 110, border: '1.5px solid var(--blue-bg)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right', background: 'var(--blue-bg2)' }} />
                            ) : (
                              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 500, color: it.revenue != null ? 'var(--txt)' : 'var(--muted)' }}>{it.revenue != null ? `¥${it.revenue.toLocaleString()}` : '未入力'}</span>
                            )}
                          </div>
                          {/* A2a: デリバリー割当（明細単位） */}
                          {(() => {
                            const assign = (selected.deal_items ? (selected._deliveries ?? []) : []).find(a => a.deal_item_id === it.id)
                            const curDelivery = assign?.delivery_id ?? ''
                            const curFee = assign?.base_fee ?? 0
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                  <span style={{ fontSize: '.58rem', color: 'var(--muted2)', flex: 1 }}>デリバリー</span>
                                  {/* C1: 候補はサービス一致を先頭グループ（このサービスの担当）、それ以外を「その他の委託先」へ */}
                                  <select value={curDelivery} disabled={!editable || itemBusy}
                                    onChange={e => setItemDelivery(it.id, e.target.value || null, e.target.value ? curFee : 0)}
                                    style={{ border: '0.5px solid var(--line)', borderRadius: 7, padding: '4px 7px', fontFamily: 'inherit', fontSize: '.66rem', background: '#fff', maxWidth: 130 }}>
                                    <option value="">MB自身（委託費0）</option>
                                    <DeliveryOptGroups opts={deliveriesOpt} serviceId={it.service_id} />
                                  </select>
                                  {curDelivery && (
                                    <input key={`${selected.id}:${it.id}:fee`} defaultValue={curFee || ''} inputMode="numeric" placeholder="委託費" disabled={!editable || itemBusy}
                                      onBlur={e => { const v = Math.max(0, Number(e.target.value.trim() || 0)); if (v !== curFee) setItemDelivery(it.id, curDelivery, v) }}
                                      style={{ width: 78, border: '0.5px solid var(--line)', borderRadius: 7, padding: '4px 7px', fontFamily: 'Inter', fontSize: '.68rem', textAlign: 'right' }} />
                                  )}
                                </div>
                                {/* A2b: 割当が確定している明細のみ経費を申請/承認できる */}
                                {curDelivery && assign?.id && (
                                  <DeliveryExpenses assign={assign} editable={editable} busy={itemBusy}
                                    onAdd={addExpense} onStatus={setExpenseStatus} onDelete={deleteExpense} onView={viewEvidence} />
                                )}
                              </>
                            )
                          })()}
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0' }}>
                        <span style={{ fontSize: '.68rem', fontWeight: 500 }}>報酬合計（パートナー）</span>
                        <RewardPill><span className="tnum" style={{ fontFamily: 'Inter' }}>¥{selected.amount.toLocaleString()}</span></RewardPill>
                      </div>
                    </div>

                    {/* A1: その他原価（いつでも編集可・P&L表示専用）。MB担当は右カラム「お客さま」へ移設（B2・常時可視）。 */}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>その他原価</span>
                        {/* B2: key=selected.id で案件跨ぎのdefaultValue残留を解消（他のmoney入力も同様） */}
                        <input key={selected.id} defaultValue={selected.other_cost ?? ''} inputMode="numeric" placeholder="0" disabled={itemBusy}
                          onBlur={e => { const v = e.target.value.trim(); if (v !== String(selected.other_cost ?? '')) savePnl({ other_cost: v }) }}
                          style={{ width: 96, border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 9px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                      </div>
                    </div>

                    {/* A1: プロジェクトP&L（読取専用集計・保存値非接触） */}
                    {(() => {
                      const pnl = computeProjectPnl({
                        items: items.map(i => ({ revenue: i.revenue ?? null })),
                        partnerReward: selected.amount,
                        frontierOverride: selected._frontier_override ?? 0,
                        otherCost: selected.other_cost ?? 0,
                        deliveryCost: selected._delivery_cost ?? 0,
                        deliveryExpense: selected._delivery_expense ?? 0,
                      })
                      // B1: 行の並びで語る（説明文なし）。MB粗利=強調行13px/500・正=var(--txt)/負=var(--red)。式は computeProjectPnl 不変。
                      const Row = ({ label, val, minus, strong }: { label: string; val: number; minus?: boolean; strong?: boolean }) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: strong ? '10px 0 0' : '4px 0', fontSize: strong ? 13 : '.68rem', fontWeight: 500, borderTop: strong ? '0.5px solid var(--line)' : undefined, marginTop: strong ? 6 : 0 }}>
                          <span style={{ color: strong ? 'var(--txt)' : 'var(--muted2)' }}>{minus ? '− ' : ''}{label}</span>
                          <span className="tnum" style={{ fontFamily: 'Inter', color: strong ? (pnl.mbMargin >= 0 ? 'var(--txt)' : 'var(--red)') : 'var(--txt)' }}>{minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}</span>
                        </div>
                      )
                      return (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '0.5px solid var(--line)' }}>
                          <p style={{ fontSize: '.62rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 8 }}>プロジェクトP&L</p>
                          <Row label="受注額（売上合計）" val={pnl.revenue} />
                          <Row label="パートナー報酬" val={pnl.partnerReward} minus />
                          <Row label="フロンティアoverride" val={pnl.frontierOverride} minus />
                          <Row label="デリバリー委託費" val={pnl.deliveryCost} minus />
                          <Row label="デリバリー経費" val={pnl.deliveryExpense} minus />
                          <Row label="その他原価" val={pnl.otherCost} minus />
                          <Row label="MB粗利" val={pnl.mbMargin} strong />
                        </div>
                      )
                    })()}

                    {editable && (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                        <select value={itemForm.service_id} onChange={e => setItemForm(f => ({ ...f, service_id: e.target.value, menu_id: '' }))} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff' }}>
                          <option value="">サービス…</option>
                          {svcMenus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {svc && (
                          <select value={itemForm.menu_id} onChange={e => setItemForm(f => ({ ...f, menu_id: e.target.value }))} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff' }}>
                            <option value="">メニュー（任意・固定額）</option>
                            {(svc.service_menus ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                        {(() => {
                          const m = svc?.service_menus?.find(x => x.id === itemForm.menu_id)
                          const isRate = m ? (selected.channel === 'cooperation' ? m.coop_type === 'rate' : m.ref_type === 'rate') : false
                          if (isRate) return <input value={itemForm.base_amount} onChange={e => setItemForm(f => ({ ...f, base_amount: e.target.value }))} placeholder="実績(率)" inputMode="numeric" style={{ width: 86, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'Inter', fontSize: '.72rem' }} />
                          if (!m) return <input value={itemForm.amount} onChange={e => setItemForm(f => ({ ...f, amount: e.target.value }))} placeholder="固定額" inputMode="numeric" style={{ width: 86, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'Inter', fontSize: '.72rem' }} />
                          return null
                        })()}
                        <button onClick={addItem} disabled={itemBusy || !itemForm.service_id} className="ui-btn ui-btn--secondary" style={{ fontSize: '.72rem', padding: '7px 12px' }}>明細を追加</button>
                      </div>
                    )}
                  </div>
                  {/* V-1: デリバリー進行（プロジェクト管理）。お金ロジック非接触・実行メタデータのみ。 */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <DeliveryProgress deal={selected as any} onRefresh={() => refreshDeals(selected.id)} />
                </>)
                {/* summary=「金額・原価 ▸」12px/muted 1行。confirmed/paid/lost（=編集ロック後）は自動展開＝クリックで閉じない。 */}
                return (
                  <details open={opened} onToggle={e => { if (!autoOpen) setMoneyOpen(e.currentTarget.open) }}>
                    <summary onClick={e => { if (autoOpen) e.preventDefault() }}
                      style={{ cursor: autoOpen ? 'default' : 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>
                      <span>金額・原価</span>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                        style={{ flexShrink: 0, transform: opened ? 'rotate(90deg)' : 'none', transition: 'transform .14s var(--ease-out)' }}>
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </summary>
                    {/* 閉時は中身を非レンダリング＝動的import（DeliveryProgress）は開くまでマウントしない */}
                    {opened && renderMoney()}
                  </details>
                )
              })()}
              </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ② Base-amount entry modal (rate-based confirmation) */}
      {baseModal && (() => {
        const base = Number(baseInput.replace(/[,，\s]/g, ''))
        const preview = base && !Number.isNaN(base) && base > 0 ? Math.round(base * baseModal.rate / 100) : null
        return (
          <>
            <div onClick={() => setBaseModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block' }}>成約確定 — 実額の入力</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>
                {baseModal.deal.customer_name}（報酬 {baseModal.rate}% × {baseModal.baseLabel}）。{baseModal.baseLabel}の実額を入力してください。
              </p>
              <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', margin: '16px 0 6px' }}>{baseModal.baseLabel}（円）</label>
              <input
                autoFocus
                inputMode="numeric"
                value={baseInput}
                onChange={e => setBaseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmWithBase() }}
                placeholder="例：300000"
                style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'Inter', fontSize: '.9rem' }}
              />
              <div style={{ marginTop: 12, padding: '11px 14px', background: 'var(--blue-bg2)', borderRadius: 10, fontSize: '.74rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted2)' }}>確定報酬（{baseModal.rate}%）</span>
                <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)', fontSize: '.95rem' }}>{preview != null ? `¥${preview.toLocaleString()}` : '—'}</b>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setBaseModal(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={confirmWithBase} disabled={pending || preview == null} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>成約確定する</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* N: 不成立化モーダル（理由＋メモ） */}
      {lostModal && (
        <>
          <div onClick={() => setLostModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
            <b style={{ fontSize: '.92rem', display: 'block', lineHeight: 1.5 }}>{customerHonorific(lostModal)}を「不成立」にしますか</b>
            {/* A3: 用途と挙動差（可逆・記録が残る）を操作の瞬間にのみ語る（理由入力はこのダイアログに統合）。 */}
            <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>
              お客さまとの取引が成立しなかった場合に使います。案件は記録に残り、90日以内は再開できます。
            </p>
            {/* 静音化v2: 結果予告は操作の瞬間＝このダイアログ内でのみ語る（正典 forecastLine） */}
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.7 }}>
              {forecastLine(lostModal.status, 'lost')}
            </p>
            <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', margin: '16px 0 8px' }}>失注理由</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {LOST_REASONS.map(r => (
                <button key={r} onClick={() => setLostReason(r)}
                  style={{ fontSize: '.7rem', padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                    border: `1.5px solid ${lostReason === r ? 'var(--red)' : 'var(--line)'}`,
                    background: lostReason === r ? 'var(--red-bg)' : '#fff', color: lostReason === r ? 'var(--red)' : 'var(--txt)' }}>
                  {lostReasonLabel(r)}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', margin: '16px 0 6px' }}>メモ（任意）</label>
            <textarea value={lostNote} onChange={e => setLostNote(e.target.value)} rows={2} placeholder="補足があれば"
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setLostModal(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
              <button onClick={confirmLost} disabled={pending || !lostReason} style={{ fontSize: '.74rem', padding: '9px 18px', borderRadius: 8, border: 'none', cursor: lostReason ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 500, background: 'var(--red)', color: '#fff', opacity: (pending || !lostReason) ? .5 : 1 }}>
                不成立にする
              </button>
            </div>
          </div>
        </>
      )}

      {/* A3: 案件取り消しの確認ダイアログ（window.confirm廃止・一本化）。不可逆＝痕跡ゼロ・通知なしを操作の瞬間にのみ語る。 */}
      {cancelConfirm && (
        <>
          <div onClick={() => setCancelConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
            <b style={{ fontSize: '.92rem', display: 'block', lineHeight: 1.5 }}>{customerHonorific(cancelConfirm)}を取り消しますか</b>
            <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 8, lineHeight: 1.7 }}>
              誤登録・重複の削除に使います。案件と明細は完全に削除され、この操作は元に戻せません。パートナーへの通知はありません。
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setCancelConfirm(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
              <button onClick={() => { const d = cancelConfirm; setCancelConfirm(null); cancelDeal(d) }} disabled={pending}
                style={{ fontSize: '.74rem', padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, background: 'var(--red)', color: '#fff', opacity: pending ? .5 : 1 }}>
                取り消す
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 500, zIndex: 99, whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span>{toast.msg}</span>
          {/* 実装2: Undo（project間ドロップ後8秒間）。元に戻す＝setProjectStatusForDeal(deal, 元のproject_status) */}
          {toast.undo && (
            <button onClick={() => { const u = toast.undo; if (toastTimer.current) clearTimeout(toastTimer.current); setToast(null); u?.() }}
              style={{ background: 'none', border: 'none', color: '#fff', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, padding: 0 }}>
              元に戻す
            </button>
          )}
        </div>
      )}

      {/* 実装2: 波及あり遷移（3面表示変化/メール送信）の確定前確認。本文は正典 forecastLine。承認後は従来の updateStatus。 */}
      {moveConfirm && (() => {
        const t = statusTranslation(moveConfirm.to)
        return (
          <>
            <div onClick={() => setMoveConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block', lineHeight: 1.5 }}>{customerHonorific(moveConfirm.deal)}を「{t.ops}」へ移動しますか</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 8, lineHeight: 1.7 }}>
                {forecastLine(moveConfirm.deal.status, moveConfirm.to)}
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setMoveConfirm(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={() => { const { deal, to } = moveConfirm; setMoveConfirm(null); updateStatus(deal, to) }} disabled={pending} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>移動する</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* 静音化v2(A2): 動詞CTA・管理操作の確認ダイアログ — 本文=forecastLine＋precondition1行・実行する/キャンセル。
          承認後は既存の updateStatus（baseModal/lostModal等のガード分岐は関数内で活きる）／reopen=lost復活は reopenDeal。 */}
      {ctaConfirm && (() => {
        const t = statusTranslation(ctaConfirm.to)
        return (
          <>
            <div onClick={() => setCtaConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block', lineHeight: 1.5 }}>{customerHonorific(ctaConfirm.deal)}を「{t.ops}」にしますか</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 8, lineHeight: 1.7 }}>
                {forecastLine(ctaConfirm.from, ctaConfirm.to)}
              </p>
              {ctaConfirm.precondition && (
                <p style={{ fontSize: '.66rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>条件：{ctaConfirm.precondition}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setCtaConfirm(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={() => { const c = ctaConfirm; setCtaConfirm(null); if (c.reopen) reopenDeal(c.deal); else updateStatus(c.deal, c.to) }} disabled={pending} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>実行する</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* 実装3: ステータスマトリクス — 行=DEAL_STATUS_KEYS＋project_status注記行、列=運営/パートナー/デリバリー/通知メール。
          値は正典（statusTranslation / statusEntryEffects / projectLaneTranslation）から導出・ハードコードなし。 */}
      {matrixOpen && (
        <>
          <div onClick={() => setMatrixOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="page-anim" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 680, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.92rem' }}>ステータスと3面の表示</b>
              <button onClick={() => setMatrixOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>
              案件ステータスごとに、パートナー・デリバリーへの表示と自動送信メールが決まります
            </p>
            <div style={{ marginTop: 14, border: '0.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.7rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg2)' }}>
                    {['運営', 'パートナー', 'デリバリー', '通知メール'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontWeight: 500, fontSize: '.6rem', color: 'var(--muted2)', padding: '8px 12px', borderBottom: '0.5px solid var(--line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DEAL_STATUS_KEYS.map(k => {
                    const t = statusTranslation(k)
                    const eff = statusEntryEffects(k)
                    return (
                      <tr key={k}>
                        <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[k]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                            <span style={{ fontWeight: 500 }}>{t.ops}</span>
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top' }}>{t.partner}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top' }}>{t.vendor}</td>
                        <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top', lineHeight: 1.6 }}>
                          {eff.mails.length === 0
                            ? <span style={{ color: 'var(--muted)' }}>—</span>
                            : eff.mails.map(m => <div key={m.key}>{m.audience}宛「{m.name}」</div>)}
                          {eff.mailNote && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>（{eff.mailNote}）</div>}
                          {eff.opsNotify && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>運営へ通知</div>}
                          {eff.extra && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{eff.extra}</div>}
                        </td>
                      </tr>
                    )
                  })}
                  {/* project_status の注記行（3面写像は projectLaneTranslation＝confirmed の翻訳に固定） */}
                  {(() => {
                    const pt = projectLaneTranslation()
                    return (
                      <tr>
                        <td style={{ padding: '9px 12px', verticalAlign: 'top' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--st-neutral)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>プロジェクト状態</span>
                          </span>
                          <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>未着手〜納品完了</div>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top' }}>{pt.partner}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top' }}>{pt.vendor}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top', color: 'var(--muted)' }}>—</td>
                      </tr>
                    )
                  })()}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 12, lineHeight: 1.7 }}>
              プロジェクト状態（未着手〜納品完了）は社内管理で、パートナー・デリバリーには表示されません
            </p>
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.7 }}>
              メール文面の編集は <Link href="/console/settings/mail" style={{ color: 'var(--c-blue)', textDecoration: 'underline', textUnderlineOffset: 3 }}>設定→メール</Link>
            </p>
          </div>
        </>
      )}

      {/* F-3a: 直営業プロジェクト起票モーダル。intake=direct → API が MB直営(is_system)・confirmed・amount=0・未着手 で作成。
           受注額は deal_items.revenue（MB粗利）へ／パートナー報酬には非流入。MB直営は裏方で一覧に出さない。 */}
      {directModal && (() => {
        // D: サービスはsvcMenusマスタ（/api/services）から。メニュー/MB担当/デリバリーは任意（v2.2静音＝説明文なし・ラベルのみ）。
        const dSvc = svcMenus.find(s => s.id === directForm.service_id)
        const dMenus = dSvc?.service_menus ?? []
        const dLabel = (t: string) => <label style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 500 }}>{t}</label>
        const dField = { width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.8rem', margin: '5px 0 14px', background: '#fff' } as const
        return (
        <div onClick={() => !directBusy && setDirectModal(false)} className="modal-fade" style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 430, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 16, padding: '22px 24px', boxShadow: '0 24px 64px rgba(14,14,20,.24)' }}>
            <b style={{ fontSize: '.92rem', display: 'block', marginBottom: 14 }}>直営業プロジェクトを起票</b>
            {dLabel('企業名')}
            <input value={directForm.customer_name} disabled={directBusy} autoFocus onChange={e => setDirectForm(f => ({ ...f, customer_name: e.target.value }))}
              style={dField} />
            {dLabel('サービス')}
            <select value={directForm.service_id} disabled={directBusy} onChange={e => setDirectForm(f => ({ ...f, service_id: e.target.value, menu_id: '' }))}
              style={dField}>
              <option value="">選択してください</option>
              {svcMenus.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {dMenus.length > 0 && (
              <>
                {dLabel('メニュー（任意）')}
                <select value={directForm.menu_id} disabled={directBusy} onChange={e => setDirectForm(f => ({ ...f, menu_id: e.target.value }))}
                  style={dField}>
                  <option value="">未選択</option>
                  {dMenus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </>
            )}
            {dLabel('受注額（任意）')}
            <input value={directForm.revenue} disabled={directBusy} inputMode="numeric" onChange={e => setDirectForm(f => ({ ...f, revenue: e.target.value }))} placeholder="例：300000"
              style={{ ...dField, fontFamily: 'Inter', textAlign: 'right' }} />
            {dLabel('MB担当（任意）')}
            <select value={directForm.director_id} disabled={directBusy} onChange={e => setDirectForm(f => ({ ...f, director_id: e.target.value }))}
              style={dField}>
              <option value="">未割当</option>
              {directors.map(d => <option key={d.id} value={d.id}>{d.name}（{d.role}）</option>)}
            </select>
            {dLabel('デリバリー（任意）')}
            <select value={directForm.delivery_id} disabled={directBusy} onChange={e => setDirectForm(f => ({ ...f, delivery_id: e.target.value }))}
              style={{ ...dField, margin: '5px 0 18px' }}>
              <option value="">MB自身（委託費0）</option>
              <DeliveryOptGroups opts={deliveriesOpt} serviceId={directForm.service_id || null} />
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDirectModal(false)} disabled={directBusy} style={{ border: '1.5px solid var(--line)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, padding: '8px 16px', borderRadius: 8, color: 'var(--muted2)' }}>キャンセル</button>
              <button onClick={createDirectProject} disabled={directBusy} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, padding: '8px 18px', borderRadius: 8, color: '#fff', background: 'var(--c-blue)', opacity: directBusy ? .6 : 1 }}>{directBusy ? '作成中…' : '起票する'}</button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
