'use client'
import { useEffect, useState, useTransition, useRef } from 'react'
import ServiceAvatar from '@/components/ServiceAvatar'
import ChannelMark from '@/components/ChannelMark'
import ConsoleNav from '@/components/ConsoleNav'
import { customerHonorific } from '@/lib/customer'
import { computeProjectPnl } from '@/lib/pnl'
import { phaseOf, PHASE_LABEL, PHASE_STYLE, INTAKE_LABEL, PROJECT_STATUSES, PROJECT_STATUS_STYLE } from '@/lib/phase'
import StatusPill from '@/components/ui/StatusPill'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { dealStatus, projectStatus as projectStatusPill, intakeType as intakePill, DEAL_STATUS } from '@/lib/status'
import { engagementLabel } from '@/lib/engagement-labels'
import DeliveryProgress from './DeliveryProgress'
import ContinuousMonthly from './ContinuousMonthly'

type Deal = {
  id: string; customer_name: string; channel: string; source: string
  customer_type?: string | null; company_name?: string | null; contact_name?: string | null; contact_title?: string | null
  status: string; amount: number; base_amount: number | null; created_at: string; service_id: string
  lost_at?: string | null; lost_reason?: string | null; lost_note?: string | null
  reward_snapshot: { ref_type?: string; ref_value?: number; ref_base?: string; effective_kind?: string; gate_reason?: string; reward_type?: string; reward_value?: number; months?: number } | null
  continuous_months?: number | null
  service_menus: { coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null; coop_base?: string | null } | null
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
  review_stage?: string | null // ②A-2: 稟議ステージ(表示専用メタ・status非接触)
  _phase?: 'shodan' | 'project'
}

// N: 失注理由（選択式）
const LOST_REASONS = ['予算', 'タイミング', '競合', '連絡途絶', 'ニーズ不一致', 'お客様都合', 'その他'] as const

type Service = { id: string; name: string; icon: string; color: string }
// L2: 案件明細（A1: revenue=受注額/売上）
type DealItem = { id: string; service_id: string; menu_id?: string | null; kind: string; amount: number; base_amount: number | null; revenue?: number | null; sort: number; services?: { name: string } | null }
type Director = { id: string; name: string; role: string; color: string }
// A2a: デリバリー
type DeliveryOpt = { id: string; name: string; kind: string | null }
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

const COLS = [
  { key: 'received',    label: '受付',       accent: 'var(--amber)', accentBg: 'var(--amber-bg)' },
  { key: 'in_progress', label: '対応中',     accent: 'var(--c-blue)',  accentBg: 'var(--blue-bg)' },
  { key: 'confirmed',   label: '成約・確定', accent: 'var(--green)', accentBg: 'var(--green-bg)' },
  { key: 'paid',        label: '支払済',     accent: 'var(--muted2)', accentBg: 'var(--bg2)' },
  { key: 'lost',        label: '不成立',     accent: 'var(--red)',   accentBg: 'var(--red-bg)' },
] as const

type Status = typeof COLS[number]['key']

// R-a：案件詳細ビュー用の“読み取り専用”進捗ステッパー。段階・順序・ラベルは lib/status.ts(SSoT)から導出。
// ★表示のみ：onClick/mutation を一切持たない（status遷移＝不変）。'lost' は本流外なので不成立として別扱い。
const DEAL_FLOW = ['received', 'in_progress', 'confirmed', 'paid'] as const
function DealStepper({ status }: { status: string }) {
  const isLost = status === 'lost'
  const curIdx = DEAL_FLOW.indexOf(status as typeof DEAL_FLOW[number])
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {DEAL_FLOW.map((k, i) => {
          const done = !isLost && curIdx >= 0 && i <= curIdx
          const isCur = !isLost && i === curIdx
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'flex-start', flex: i < DEAL_FLOW.length - 1 ? 1 : '0 0 auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, width: 56 }}>
                <span style={{ width: isCur ? 13 : 10, height: isCur ? 13 : 10, borderRadius: '50%', background: done ? 'var(--c-blue)' : '#fff', border: `2px solid ${done ? 'var(--c-blue)' : 'var(--line)'}`, boxShadow: isCur ? '0 0 0 3px var(--blue-bg)' : 'none', marginTop: isCur ? 0 : 1.5, transition: 'all .15s' }} />
                <span style={{ fontSize: '.54rem', fontWeight: isCur ? 800 : 600, color: isCur ? 'var(--c-blue)' : 'var(--muted2)', whiteSpace: 'nowrap' }}>{DEAL_STATUS[k].label}</span>
              </div>
              {i < DEAL_FLOW.length - 1 && <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: (!isLost && curIdx > i) ? 'var(--c-blue)' : 'var(--line)', marginTop: 5 }} />}
            </div>
          )
        })}
      </div>
      {isLost && <span style={{ display: 'inline-block', marginTop: 10, fontSize: '.6rem', fontWeight: 800, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 20, padding: '3px 11px' }}>不成立</span>}
    </div>
  )
}
// QR: ボードはアクティブ3列のみ（成約・確定=入金待ちは残す）。支払済/不成立はアーカイブへ。
const BOARD_KEYS: string[] = ['received', 'in_progress', 'confirmed']
// 通常フローは線形（不成立は別操作・再開可能）
const NEXT: Record<string, Status | null> = {
  received: 'in_progress', in_progress: 'confirmed', confirmed: 'paid', paid: null, lost: null,
}
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
  { key: '未着手', label: '成約・未着手', group: 'project', tone: 'neutral' },
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
        <span style={{ fontSize: '.54rem', color: 'var(--muted2)', fontWeight: 700 }}>経費（承認済 ¥{approved.toLocaleString()}）</span>
      </div>
      {exps.map(e => {
        const b = badge(e.status)
        return (
          <div key={e.id} className="ui-row" style={{ gap: 5, padding: '3px 0', fontSize: '.62rem' }}>
            <span style={{ color: 'var(--muted2)', width: 36, flexShrink: 0 }}>{e.kind}</span>
            <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 700, minWidth: 56, textAlign: 'right' }}>¥{(e.amount ?? 0).toLocaleString()}</span>
            <span style={{ fontSize: '.5rem', fontWeight: 700, color: b.c, background: b.bg, borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>{b.t}</span>
            {e.has_evidence && <button onClick={() => onView(e.id)} title="領収書" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.62rem', color: 'var(--c-blue)', padding: 0 }}>📎</button>}
            <span style={{ flex: 1 }} />
            {e.status !== 'approved' && <button onClick={() => onStatus(e.id, 'approved')} disabled={busy} style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--green)', background: 'none', border: '1px solid var(--green)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer' }}>承認</button>}
            {e.status !== 'rejected' && <button onClick={() => onStatus(e.id, 'rejected')} disabled={busy} style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 6, padding: '1px 6px', cursor: 'pointer' }}>却下</button>}
            <button onClick={() => onDelete(e.id)} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.62rem' }}>✕</button>
          </div>
        )
      })}
      {editable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <select value={kind} onChange={e => setKind(e.target.value)} disabled={busy} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '3px 5px', fontFamily: 'inherit', fontSize: '.6rem', background: '#fff' }}>
            {EXP_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="金額" disabled={busy}
            style={{ width: 64, border: '1px solid var(--line)', borderRadius: 6, padding: '3px 6px', fontFamily: 'Inter', fontSize: '.62rem', textAlign: 'right' }} />
          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy}
            style={{ fontSize: '.52rem', width: 116 }} />
          <button onClick={submit} disabled={busy || !amount.trim()} style={{ fontSize: '.58rem', fontWeight: 700, color: '#fff', background: 'var(--c-blue)', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', opacity: (busy || !amount.trim()) ? .5 : 1 }}>経費を追加</button>
        </div>
      )}
    </div>
  )
}

export default function DealsPage() {
  const [deals, setDeals]           = useState<Deal[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<Deal | null>(null)
  // ④ 対応範囲（協力タスク）：管理側が done を確認して立てる（パートナー自己申告から移管）。done値の読み書きのみ・money計算不変。
  const [dealTasks, setDealTasks]   = useState<{ id: string; label: string; kind: string; required: boolean; done: boolean; sort: number }[]>([])
  const [taskBusy, setTaskBusy]     = useState<string | null>(null)
  const [profile, setProfile]       = useState<{ name: string; color: string } | null>(null)
  const [pending, startTransition]  = useTransition()
  const [toast, setToast]           = useState('')
  const [filterSvc, setFilterSvc]   = useState('all')
  const [services, setServices]     = useState<Service[]>([])
  const dragItem = useRef<{ id: string; status: string } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  // B2: 0件カラムを細い折りたたみ列に（表示のみ）。ユーザーが手動展開したカラムを保持（永続化不要）。
  const [expandedEmpty, setExpandedEmpty] = useState<Record<string, boolean>>({})
  const toggleCol = (key: string) => setExpandedEmpty(p => ({ ...p, [key]: !p[key] }))
  // ② base-amount entry on confirming a rate-based deal
  const [baseModal, setBaseModal] = useState<{ deal: Deal; rate: number; baseLabel: string } | null>(null)
  const [baseInput, setBaseInput] = useState('')
  // ① edit 実績金額 from the detail panel (any status)
  const [editingBase, setEditingBase] = useState(false)
  // ② IA再構成：詳細ドロワーのタブ（概要/進行/金額・原価）。表示のグルーピングのみ・ハンドラ非接触。
  const [detailTab, setDetailTab] = useState<'overview' | 'progress' | 'money'>('overview')
  const [baseEdit, setBaseEdit] = useState('')
  // N: 不成立化モーダル（理由＋メモ）
  const [lostModal, setLostModal] = useState<Deal | null>(null)
  const [lostReason, setLostReason] = useState<string>('')
  const [lostNote, setLostNote] = useState('')
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
  // F-3a: 直営業プロジェクト起票モーダル。
  const [directModal, setDirectModal] = useState(false)
  const [directForm, setDirectForm] = useState<{ customer_name: string; service_id: string; revenue: string }>({ customer_name: '', service_id: '', revenue: '' })
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

  // ② 案件を切り替えたらタブを「概要」に戻す（表示状態のリセットのみ）。
  useEffect(() => { setDetailTab('overview'); setEditingBase(false) }, [selected?.id])

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

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // L2: 明細変更後にボードを再取得し選択中dealを更新（deals.amount=Σ・明細を反映）。
  async function refreshDeals(keepId?: string) {
    const d = await fetch('/api/console/deals').then(r => r.json())
    setDeals(d.deals)
    if (keepId) setSelected(d.deals.find((x: Deal) => x.id === keepId) ?? null)
  }
  // F-3a: 任意の deal の project_status を変更（ボードのプロジェクト・レーン間ドラッグ用）。お金に非干渉。
  async function setProjectStatusForDeal(deal: Deal, ps: string) {
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, project_status: ps } : d))  // 楽観更新
    if (selected?.id === deal.id) setSelected(s => s ? { ...s, project_status: ps } : s)
    try {
      const res = await fetch(`/api/console/deals/${deal.id}/project-status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_status: ps }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.needsMigration) { showToast(data.needsMigration ? 'project_status列のDB適用が必要です' : (data.error ?? '更新に失敗しました')); await refreshDeals(selected?.id) }
      else showToast(`プロジェクト状態を「${ps}」に変更しました`)
    } catch { showToast('更新に失敗しました'); await refreshDeals(selected?.id) }
  }
  // F-3a: 直営業プロジェクト起票（intake=direct → API が MB直営・confirmed・amount=0・未着手 で作成）。
  async function createDirectProject() {
    if (!directForm.customer_name.trim() || !directForm.service_id) { showToast('お客様名とサービスを入力してください'); return }
    setDirectBusy(true)
    try {
      const revenue = Math.max(0, Number((directForm.revenue || '').replace(/[,，\s]/g, '')) || 0)
      const res = await fetch('/api/console/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: directForm.customer_name.trim(), service_id: directForm.service_id, intake_type: 'direct', revenue }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.deal) { await refreshDeals(data.deal.id); setDirectModal(false); setDirectForm({ customer_name: '', service_id: '', revenue: '' }); showToast('直営業プロジェクトを起票しました') }
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
      if (res.ok && !data.needsMigration) await refreshDeals(selected.id)
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
  // ②A-2: 稟議ステージ更新（隔離ルート /review-stage）。★status enum・confirmed遷移・reward/frozen/payout/pnl・④b発火に一切触れない。
  async function saveReviewStage(rs: string | null) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/review-stage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_stage: rs }) })
      const data = await res.json().catch(() => ({}))
      if (res.ok && !data.needsMigration) { await refreshDeals(selected.id); showToast('稟議ステージを更新しました') }
      else if (data.needsMigration) showToast('review_stage列のDB適用が必要です')
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

  function cancelDeal(deal: Deal) {
    if (!confirm(`「${deal.customer_name}」の案件を取り消しますか?`)) return
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
      updateStatus(deal, lane.key as Status)              // 受付↔商談中（既存）
    } else if (srcPhase === 'shodan') {
      if (lane.key === '未着手') updateStatus(deal, 'confirmed')   // 成約フロー（base/報酬は既存処理）
      else showToast('先に「成約・未着手」へ移動して成約してください')
    } else {
      setProjectStatusForDeal(deal, lane.key)             // project_status 変更（お金に非干渉）
    }
    dragItem.current = null
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
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ flex: 1 }}>
            <p className="eyebrow" style={{ marginBottom: 2 }}>案件管理</p>
            <h1 style={{ fontSize: '1rem', fontWeight: 900, lineHeight: 1 }}>{view === 'board' ? '案件ボード' : 'アーカイブ'}</h1>
          </div>

          {/* QR: ボード / アーカイブ 切替 */}
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3 }}>
            {([['board', 'ボード'], ['archive', 'アーカイブ']] as const).map(([v, lbl]) => (
              <button key={v} onClick={() => setView(v)} style={{
                border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700,
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

          {/* F-3a: 直営業プロジェクト起票（商談を経ず MB直営・確定で起票）。紹介・協力の商談起票は従来どおり別導線。 */}
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
              placeholder="お客様名で検索…"
              className="ui-field"
              style={{ maxWidth: 360, fontSize: '.8rem', marginBottom: 16 }}
            />
            {(() => {
              const arch = filteredDeals
                .filter(d => d.status === 'paid' || d.status === 'lost')
                .filter(d => !archiveSearch.trim() || customerHonorific(d).toLowerCase().includes(archiveSearch.trim().toLowerCase()))
              if (arch.length === 0) return <EmptyState title="該当する案件がありません" compact />
              return (
                <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                  {arch.map((d, i) => (
                    <div key={d.id} onClick={() => setSelected(d)} className="lift" style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', cursor: 'pointer',
                      borderBottom: i < arch.length - 1 ? '1px solid #F2F2F6' : 'none',
                    }}>
                      {d.services && <ServiceAvatar logoPath={(d.services as any).logo_path ?? null} icon={d.services.icon} color={d.services.color} name={d.services.name} size={28} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(d)}</div>
                        <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 2 }}>
                          {d.services?.name}{d.status === 'lost' && d.lost_reason ? ` · 理由: ${d.lost_reason}` : ''}
                        </div>
                      </div>
                      <ChannelMark channel={d.channel} showLabel={false} />
                      <span style={{ flexShrink: 0, fontSize: '.6rem', fontWeight: 700, borderRadius: 20, padding: '2px 10px',
                        color: d.status === 'paid' ? 'var(--green)' : 'var(--muted2)',
                        background: d.status === 'paid' ? 'var(--green-bg)' : 'var(--bg2)' }}>
                        {d.status === 'paid' ? '支払済' : '不成立'}
                      </span>
                      {d.status === 'paid' && d.amount > 0 && (
                        <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 700, color: 'var(--muted2)' }}>¥{d.amount.toLocaleString()}</span>
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
          <div className="page-anim" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto', padding: '0 32px 10px' }}>
            {PIPELINE_LANES.map((lane, idx) => {
              const laneDeals = filteredDeals.filter(d => !['paid', 'lost'].includes(d.status) && laneKeyOf(d) === lane.key)
              const groupStart = lane.group === 'project' && (idx === 0 || PIPELINE_LANES[idx - 1].group === 'shodan')
              // B2: 0件カラムは既定で細い折りたたみ列。手動展開中・1件以上なら通常幅（0→1で自動的に通常表示）。
              const isEmpty = laneDeals.length === 0
              const collapsed = isEmpty && !expandedEmpty[lane.key]
              return (
                <div key={lane.key} style={{ display: 'flex', alignItems: 'stretch', gap: 14, flexShrink: 0 }}>
                  {groupStart && <div aria-hidden style={{ width: 1, background: 'var(--line)', alignSelf: 'stretch' }} />}
                  <div
                    onDragOver={e => onDragOver(e, lane.key)}
                    onDragLeave={onDragLeave}
                    onDrop={e => onDrop(e, lane.key)}
                    onClick={collapsed ? () => toggleCol(lane.key) : undefined}
                    className={collapsed ? 'card-hover' : undefined}
                    title={collapsed ? 'クリックで展開' : undefined}
                    style={{ width: collapsed ? 50 : 256, flexShrink: 0, background: 'var(--bg2)', borderRadius: 16, padding: collapsed ? '12px 4px' : 14, minHeight: 220, cursor: collapsed ? 'pointer' : 'default', border: `1px solid ${dragOverCol === lane.key ? 'var(--c-blue)' : 'var(--line)'}`, transition: 'border-color .15s var(--ease-out), width .18s var(--ease-out)' }}
                  >
                    {collapsed ? (
                      /* B2: 細い折りたたみ列＝ステージ名(縦書き)＋件数0のみ。大きな空ボックスは出さない。 */
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, height: '100%', minHeight: 196, paddingTop: 2 }}>
                        <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${lane.tone})`, flexShrink: 0 }} />
                        <span className="tnum" style={{ fontSize: '.6rem', fontWeight: 800, color: 'var(--muted2)', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 6px', minWidth: 20, textAlign: 'center' }}>0</span>
                        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: '.72rem', fontWeight: 800, color: 'var(--muted2)', whiteSpace: 'nowrap', letterSpacing: '.04em' }}>{lane.label}</span>
                      </div>
                    ) : (<>
                    {/* レーン見出し：グループ(商談/プロジェクト)＋ステージ名＋件数 */}
                    <div style={{ marginBottom: 12, padding: '2px 2px 0' }}>
                      <p style={{ fontSize: '.5rem', letterSpacing: '.14em', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>{lane.group === 'shodan' ? '商談' : 'プロジェクト'}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${lane.tone})`, flexShrink: 0 }} />
                          <span style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{lane.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {isEmpty && (
                            <button onClick={() => toggleCol(lane.key)} title="畳む" style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 7, cursor: 'pointer', color: 'var(--muted2)', fontSize: '.62rem', fontWeight: 800, lineHeight: 1, padding: '3px 6px' }}>‹ 畳む</button>
                          )}
                          <span className="tnum" style={{ fontSize: '.64rem', fontWeight: 800, color: 'var(--muted2)', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px', minWidth: 22, textAlign: 'center' }}>{laneDeals.length}</span>
                        </div>
                      </div>
                    </div>

                    {isEmpty && (
                      <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: '.58rem', color: 'var(--muted)' }}>ここにドラッグして移動</div>
                    )}

                    {laneDeals.map(d => {
                      // BR-C3: 最小・均一カード。表示は 案件名 / 紹介・協力パートナー名(経由時のみ) / MB担当 / デリバリー。
                      //   種別・ステージ・フェーズ・ステータスは載せない（レーンで分かる）。詳細は案件詳細へ。
                      const intake = d.intake_type ?? 'referral_coop'
                      const partnerName = intake !== 'direct' && d.partners?.profiles ? d.partners.profiles.name : null
                      const partnerKindLabel = engagementLabel(d.channel)   // 区分語は空（direct のみ）
                      const directorName = d.director_id ? (directors.find(x => x.id === d.director_id)?.name ?? null) : null
                      const deliveryName = (d._deliveries ?? []).find(a => a.delivery_id)?.deliveries?.name ?? null
                      const rejectedExp = (d._deliveries ?? []).some(a => (a._expenses ?? []).some(e => e.status === 'rejected'))
                      const revenueMissing = (d._phase ?? phaseOf(d)) === 'project' && (d.deal_items?.length ?? 0) > 0 && (d.deal_items ?? []).every(it => it.revenue == null)
                      const attention = needsBase(d) || rejectedExp || revenueMissing
                      const meta = [directorName && `担当 ${directorName}`, partnerName && `${partnerKindLabel ? partnerKindLabel + ' ' : ''}${partnerName}`, deliveryName && `委託 ${deliveryName}`].filter(Boolean).join('　·　')
                      return (
                        <div
                          key={d.id}
                          draggable
                          onDragStart={() => onDragStart(d)}
                          onClick={() => setSelected(d)}
                          className="card-hover ui-card"
                          style={{ background: 'var(--s-0)', border: '1px solid var(--line)', borderRadius: 13, padding: '10px 12px', marginBottom: 8, cursor: 'grab', boxShadow: selected?.id === d.id ? '0 0 0 2px var(--c-blue)' : undefined, userSelect: 'none', height: 66, overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 7 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            {attention && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: '#fff', background: 'var(--red)', borderRadius: 20, padding: '2px 7px', letterSpacing: '.02em' }}>要対応</span>}
                            {d.services
                              ? <ServiceAvatar logoPath={(d.services as any).logo_path ?? null} icon={d.services.icon} color={d.services.color} name={d.services.name} size={24} />
                              : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={24} />}
                            <b style={{ flex: 1, fontSize: '.76rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{customerHonorific(d)}</b>
                          </div>
                          <div style={{ fontSize: '.58rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta || '—'}</div>
                        </div>
                      )
                    })}
                    </>)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: 460, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.9rem' }}>{customerHonorific(selected)}</b>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div className="cascade" style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
              {/* R-a：読み取り専用の進捗ステッパー（現在statusをハイライト・変更導線なし） */}
              <DealStepper status={selected.status} />

              {/* ② 次にすること：現 status を読むだけで主要操作を1つ提示。既存ハンドラ(updateStatus/reopenDeal)を呼ぶショートカット。新しい遷移/計算なし。 */}
              {(() => {
                const st = selected.status
                const noItems = (selected.deal_items?.length ?? 0) === 0
                let act: { label: string; onClick: () => void; hint?: string } | null = null
                if (st === 'received') act = { label: '対応中にする', onClick: () => updateStatus(selected, 'in_progress') }
                else if (st === 'in_progress') act = noItems
                  ? { label: '明細を追加して成約へ', onClick: () => setDetailTab('money'), hint: '成約には明細が1つ以上必要です。' }
                  : { label: '成約を確定する', onClick: () => updateStatus(selected, 'confirmed') }
                else if (st === 'confirmed') act = { label: '支払済にする', onClick: () => updateStatus(selected, 'paid') }
                else if (st === 'lost') {
                  const days = selected.lost_at ? Math.floor((Date.now() - new Date(selected.lost_at).getTime()) / 86_400_000) : null
                  if (days != null && days <= 90) act = { label: '対応中に戻す（復活）', onClick: () => reopenDeal(selected) }
                }
                const baseNeeded = rateInfo(selected).isRate && selected.base_amount == null && st !== 'lost' && st !== 'paid'
                if (!act && !baseNeeded) return null
                return (
                  <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12 }}>
                    <p style={{ fontSize: '.56rem', fontWeight: 800, color: 'var(--blue-dk)', letterSpacing: '.06em', marginBottom: 8 }}>次にすること</p>
                    {act && (
                      <button onClick={act.onClick} disabled={pending} className="btn btn-p" style={{ width: '100%', fontSize: '.76rem', padding: '10px 14px' }}>
                        {act.label}
                      </button>
                    )}
                    {act?.hint && <p style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.5 }}>{act.hint}</p>}
                    {baseNeeded && (
                      <button onClick={() => setDetailTab('progress')} className="btn btn-g" style={{ width: '100%', fontSize: '.72rem', padding: '8px 14px', marginTop: act ? 8 : 0 }}>
                        実績金額を入力する
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* ② タブ：概要（見るだけ）／進行（状態を進める）／金額・原価（明細・P&L）。中身は同じJSX・同じハンドラを箱に振り分けるだけ。 */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg2)', borderRadius: 10, padding: 3 }}>
                {([['overview', '概要'], ['progress', '進行'], ['money', '金額・原価']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setDetailTab(k)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 800,
                      background: detailTab === k ? '#fff' : 'transparent', color: detailTab === k ? 'var(--c-blue)' : 'var(--muted2)',
                      boxShadow: detailTab === k ? '0 1px 3px rgba(14,14,20,.08)' : 'none' }}>
                    {l}
                  </button>
                ))}
              </div>

              {/* 概要：基本情報（表示専用） */}
              {detailTab === 'overview' && [
                ['サービス', selected.services?.name ?? '相談（サービス未定）'],
                ['ソース', selected.source],
                ['ステータス', COLS.find(c => c.key === selected.status)?.label ?? selected.status],
                ['報酬予定', selected.amount > 0 ? `¥${selected.amount.toLocaleString()}` : '未確定'],
                ['パートナー', selected.partners ? `${selected.partners.profiles?.name ?? ''} (${selected.partners.code})` : '—'],
                ['登録日', new Date(selected.created_at).toLocaleString('ja')],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '.75rem', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted2)' }}>{k}</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
                </div>
              ))}

              {/* ②c B2B: 法人の部署・役職を additive 表示（無い場合は非表示＝従来通り） */}
              {detailTab === 'overview' && selected.contact_title && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: '.75rem', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--muted2)' }}>部署・役職</span>
                  <span style={{ fontWeight: 700, textAlign: 'right' }}>{selected.contact_title}</span>
                </div>
              )}

              {/* F-1: フェーズ／流入経路バッジ ＋ プロジェクト実行ステータス（お金に非干渉の独立メタデータ）【進行タブ】 */}
              {detailTab === 'progress' && (() => {
                const phase = selected._phase ?? phaseOf(selected)
                const intake = selected.intake_type ?? 'referral_coop'
                const ph = PHASE_STYLE[phase]
                return (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '.6rem', fontWeight: 800, color: ph.c, background: ph.bg, borderRadius: 20, padding: '3px 11px' }}>{PHASE_LABEL[phase]}</span>
                      <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 20, padding: '3px 11px' }}>{INTAKE_LABEL[intake] ?? intake}</span>
                    </div>
                    {/* プロジェクト段階のみ実行ステータスを表示・変更可（商談段階は商談語彙のまま） */}
                    {phase === 'project' && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 700 }}>プロジェクト状態</span>
                        <select value={selected.project_status ?? ''} disabled={itemBusy}
                          onChange={e => saveProjectStatus(e.target.value === '' ? null : e.target.value)}
                          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: '.72rem', fontWeight: 700, background: '#fff', color: PROJECT_STATUS_STYLE[selected.project_status ?? '']?.c ?? 'var(--txt)' }}>
                          <option value="">未設定</option>
                          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    {/* ②A-2: 稟議ステージ（in_progress時のみ・表示専用メタ・お金/confirmed非接触の隔離更新でpartnerに細分化表示） */}
                    {selected.status === 'in_progress' && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: '.7rem', color: 'var(--muted2)', fontWeight: 700 }}>稟議ステージ</span>
                        <select value={selected.review_stage ?? ''} disabled={itemBusy}
                          onChange={e => saveReviewStage(e.target.value === '' ? null : e.target.value)}
                          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: '.72rem', fontWeight: 700, background: '#fff', color: 'var(--txt)' }}>
                          <option value="">未設定（MB対応中）</option>
                          <option value="negotiating">商談中</option>
                          <option value="review">稟議中</option>
                        </select>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* L2: 明細（サービス×金額）＋合計。成約前(received/in_progress)のみ編集可。【金額・原価タブ】 */}
              {detailTab === 'money' && (() => {
                const items = selected.deal_items ?? []
                const editable = ['received', 'in_progress'].includes(selected.status)
                const svc = svcMenus.find(s => s.id === itemForm.service_id)
                return (
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700 }}>明細（内訳）</p>
                      {!editable && <span style={{ fontSize: '.56rem', color: 'var(--muted)', fontWeight: 700 }}>成約後はロック</span>}
                    </div>
                    <div style={{ background: 'var(--bg2)', borderRadius: 12, overflow: 'hidden' }}>
                      {items.length === 0 && <p style={{ padding: '12px 14px', fontSize: '.66rem', color: 'var(--muted2)' }}>明細なし（相談案件 等）</p>}
                      {[...items].sort((a, b) => a.sort - b.sort).map(it => (
                        <div key={it.id} style={{ padding: '10px 12px', borderBottom: '1px solid #ECECF1' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.services?.name ?? it.service_id}</div>
                              <div style={{ fontSize: '.56rem', color: 'var(--muted2)', marginTop: 1 }}>
                                {it.kind === 'rate' ? `率・実績 ${it.base_amount != null ? `¥${it.base_amount.toLocaleString()}` : '未入力'}` : '固定'} · 報酬
                              </div>
                            </div>
                            {editable && it.kind === 'rate' && (
                              <input defaultValue={it.base_amount ?? ''} inputMode="numeric" placeholder="実績" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.base_amount ?? '')) patchItem(it.id, { base_amount: v === '' ? null : Number(v) }) }}
                                style={{ width: 78, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.7rem', textAlign: 'right' }} />
                            )}
                            {editable && it.kind === 'fixed' && !it.menu_id && (
                              <input defaultValue={it.amount ?? ''} inputMode="numeric" placeholder="報酬" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.amount ?? '')) patchItem(it.id, { amount: v === '' ? 0 : Number(v) }) }}
                                style={{ width: 78, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.7rem', textAlign: 'right' }} />
                            )}
                            <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 700, minWidth: 58, textAlign: 'right', color: it.amount > 0 ? 'var(--txt)' : 'var(--muted)' }}>
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
                              <input defaultValue={it.revenue ?? ''} inputMode="numeric" placeholder="売上" disabled={itemBusy}
                                onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.revenue ?? '')) patchItem(it.id, { revenue: v === '' ? null : Number(v) }) }}
                                style={{ width: 110, border: '1.5px solid var(--blue-bg)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right', background: 'var(--blue-bg2)' }} />
                            ) : (
                              <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 700, color: it.revenue != null ? 'var(--txt)' : 'var(--muted)' }}>{it.revenue != null ? `¥${it.revenue.toLocaleString()}` : '未入力'}</span>
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
                                  <select value={curDelivery} disabled={!editable || itemBusy}
                                    onChange={e => setItemDelivery(it.id, e.target.value || null, e.target.value ? curFee : 0)}
                                    style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '4px 7px', fontFamily: 'inherit', fontSize: '.66rem', background: '#fff', maxWidth: 130 }}>
                                    <option value="">MB自身（委託費0）</option>
                                    {deliveriesOpt.map(dv => <option key={dv.id} value={dv.id}>{dv.name}</option>)}
                                  </select>
                                  {curDelivery && (
                                    <input defaultValue={curFee || ''} inputMode="numeric" placeholder="委託費" disabled={!editable || itemBusy}
                                      onBlur={e => { const v = Math.max(0, Number(e.target.value.trim() || 0)); if (v !== curFee) setItemDelivery(it.id, curDelivery, v) }}
                                      style={{ width: 78, border: '1px solid var(--line)', borderRadius: 7, padding: '4px 7px', fontFamily: 'Inter', fontSize: '.68rem', textAlign: 'right' }} />
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px' }}>
                        <span style={{ fontSize: '.68rem', fontWeight: 800 }}>報酬合計（パートナー）</span>
                        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.82rem', fontWeight: 800, color: 'var(--c-blue)' }}>¥{selected.amount.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* A1: MB担当・その他原価（いつでも編集可・P&L表示専用） */}
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700 }}>MB担当</span>
                        <select value={selected.director_id ?? ''} onChange={e => savePnl({ director_id: e.target.value || null })} disabled={itemBusy}
                          style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 9px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff' }}>
                          <option value="">未割当</option>
                          {directors.map(d => <option key={d.id} value={d.id}>{d.name}（{d.role}）</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 700 }}>その他原価</span>
                        <input defaultValue={selected.other_cost ?? ''} inputMode="numeric" placeholder="0" disabled={itemBusy}
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
                      const Row = ({ label, val, minus, strong }: { label: string; val: number; minus?: boolean; strong?: boolean }) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: strong ? '10px 0 0' : '4px 0', fontSize: strong ? '.78rem' : '.68rem', fontWeight: strong ? 800 : 500, borderTop: strong ? '1px solid var(--line)' : undefined, marginTop: strong ? 6 : 0 }}>
                          <span style={{ color: strong ? 'var(--txt)' : 'var(--muted2)' }}>{minus ? '− ' : ''}{label}</span>
                          <span className="tnum" style={{ fontFamily: 'Inter', color: strong ? (pnl.mbMargin >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--txt)' }}>{minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}</span>
                        </div>
                      )
                      return (
                        <div style={{ marginTop: 14, padding: '12px 15px', background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12 }}>
                          <p style={{ fontSize: '.62rem', fontWeight: 800, color: 'var(--blue-dk)', marginBottom: 8 }}>プロジェクトP&L（表示専用）</p>
                          <Row label="受注額（売上合計）" val={pnl.revenue} />
                          <Row label="パートナー報酬" val={pnl.partnerReward} minus />
                          <Row label="フロンティアoverride" val={pnl.frontierOverride} minus />
                          <Row label="その他原価" val={pnl.otherCost} minus />
                          <Row label="デリバリー委託費" val={pnl.deliveryCost} minus />
                          <Row label="デリバリー経費（承認済）" val={pnl.deliveryExpense} minus />
                          <Row label="MB粗利" val={pnl.mbMargin} strong />
                          {pnl.revenue === 0 && <p style={{ fontSize: '.56rem', color: 'var(--muted)', marginTop: 6 }}>※受注額未入力（固定明細は売上が未知のため各明細で入力してください）</p>}
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
                        <button onClick={addItem} disabled={itemBusy || !itemForm.service_id} className="btn btn-g" style={{ fontSize: '.72rem', padding: '7px 12px' }}>明細を追加</button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* V-1: デリバリー進行（プロジェクト管理）。お金ロジック非接触・実行メタデータのみ。【金額・原価タブ】 */}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {detailTab === 'money' && <DeliveryProgress deal={selected as any} onRefresh={() => refreshDeals(selected.id)} />}

              {/* P: 報酬ゲート判定（協力で必須タスク未達→紹介レート）。【概要タブ・表示専用】 */}
              {detailTab === 'overview' && selected.channel === 'cooperation' && selected.reward_snapshot?.gate_reason && (
                <div style={{ marginTop: 14, padding: '11px 14px', background: 'var(--amber-bg)', borderRadius: 10 }}>
                  <p style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--amber)' }}>対応範囲が未達のため、固定報酬で確定</p>
                  <p style={{ fontSize: '.64rem', color: 'var(--txt)', marginTop: 4, lineHeight: 1.6 }}>{selected.reward_snapshot.gate_reason}</p>
                </div>
              )}
              {detailTab === 'overview' && selected.channel === 'cooperation' && selected.reward_snapshot?.effective_kind === 'cooperation' && (
                <div style={{ marginTop: 14, padding: '9px 14px', background: 'var(--green-bg)', borderRadius: 10 }}>
                  <p style={{ fontSize: '.64rem', fontWeight: 700, color: 'var(--green)' }}>対応範囲をすべて満たし、成果報酬（粗利%）で確定</p>
                </div>
              )}

              {/* ④ 対応範囲（協力タスク）の管理側チェック：運営が確認して done を立てる（必須全達成→協力レート確定の入力）。【進行タブ】 */}
              {detailTab === 'progress' && selected.channel === 'cooperation' && dealTasks.length > 0 && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 10 }}>
                  <p style={{ fontSize: '.66rem', fontWeight: 800, marginBottom: 2 }}>対応範囲</p>
                  <p style={{ fontSize: '.58rem', color: 'var(--muted2)', margin: '0 0 8px', lineHeight: 1.5 }}>運営が対応を確認してチェックします（必須をすべて満たすと成果報酬＝粗利%が確定）。</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {[...dealTasks].sort((a, b) => a.sort - b.sort).map(t => {
                      const auto = t.kind !== 'manual'
                      return (
                        <button key={t.id} type="button" onClick={() => !auto && toggleDealTask(t.id, !t.done)} disabled={auto || taskBusy === t.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', background: 'none', border: 'none', borderBottom: '1px solid #F4F4F8', textAlign: 'left', width: '100%', cursor: auto ? 'default' : 'pointer', opacity: taskBusy === t.id ? .6 : 1, fontFamily: 'inherit' }}>
                          <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.done ? 'var(--green)' : '#fff', border: `2px solid ${t.done ? 'var(--green)' : 'var(--line)'}`, color: '#fff' }}>
                            {t.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: t.done ? 500 : 600, color: t.done ? 'var(--muted2)' : 'var(--txt)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                          {t.required && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 800, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '1px 7px' }}>必須</span>}
                          {auto && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 700, color: 'var(--muted)', background: 'var(--bg2)', borderRadius: 20, padding: '1px 7px' }}>自動</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ① 実績金額（率案件）— 編集（base_amount→報酬再計算は不変）。【進行タブ】 */}
              {detailTab === 'progress' && rateInfo(selected).isRate && (
                <div style={{ marginTop: 18, padding: '14px 16px', background: 'var(--bg2)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700 }}>実績金額（{rateInfo(selected).baseLabel}）</p>
                      <p style={{ fontSize: '.88rem', fontWeight: 800, fontFamily: 'Inter', marginTop: 3 }}>
                        {selected.base_amount != null
                          ? `¥${selected.base_amount.toLocaleString()}`
                          : <span style={{ color: 'var(--amber)', fontSize: '.74rem' }}>未入力</span>}
                      </p>
                      <p style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 3 }}>
                        × {rateInfo(selected).rate}% = 報酬 {selected.amount > 0 ? `¥${selected.amount.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    {!editingBase && selected.status !== 'lost' && (
                      <button onClick={() => { setEditingBase(true); setBaseEdit(selected.base_amount?.toString() ?? '') }} className="btn btn-g" style={{ fontSize: '.7rem', padding: '7px 12px', flexShrink: 0 }}>
                        {selected.base_amount != null ? '金額を編集' : '金額を入力'}
                      </button>
                    )}
                    {selected.status === 'lost' && (
                      <span style={{ fontSize: '.58rem', color: 'var(--muted)', flexShrink: 0 }}>不成立のため編集不可</span>
                    )}
                  </div>
                  {editingBase && (
                    <div style={{ marginTop: 12 }}>
                      <input
                        autoFocus inputMode="numeric"
                        value={baseEdit}
                        onChange={e => setBaseEdit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveBase() }}
                        placeholder={`${rateInfo(selected).baseLabel}の実額（例: 300000）`}
                        style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'Inter', fontSize: '.85rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', fontSize: '.72rem' }}>
                        <span style={{ color: 'var(--muted2)' }}>確定報酬（{rateInfo(selected).rate}%）</span>
                        <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)' }}>
                          {(() => { const bv = Number(baseEdit.replace(/[,，\s]/g, '')); return bv > 0 ? `¥${Math.round(bv * (rateInfo(selected).rate as number) / 100).toLocaleString()}` : '—' })()}
                        </b>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setEditingBase(false)} className="btn btn-g" style={{ fontSize: '.7rem', padding: '7px 12px' }}>キャンセル</button>
                        <button onClick={saveBase} disabled={pending} className="btn btn-p" style={{ fontSize: '.7rem', padding: '7px 14px' }}>保存</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 継続報酬：月次入力セクション（継続案件のみ・通常案件には出さない） */}
              {detailTab === 'progress' && continuousInfo(selected).isContinuous && (
                <ContinuousMonthly deal={selected} onChanged={() => refreshDeals(selected.id)} />
              )}

              {/* 進行タブ：不成立詳細＋復活／ステータス変更＋管理操作（ハンドラ不変） */}
              {detailTab === 'progress' && (selected.status === 'lost' ? (
                /* N: 不成立の詳細＋再開 */
                <div style={{ marginTop: 18 }}>
                  <div style={{ padding: '13px 15px', background: 'var(--red-bg)', borderRadius: 12 }}>
                    <p style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--red)' }}>不成立（見送り）</p>
                    <p style={{ fontSize: '.7rem', color: 'var(--txt)', marginTop: 6 }}>理由：{selected.lost_reason ?? '—'}</p>
                    {selected.lost_note && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.6 }}>メモ：{selected.lost_note}</p>}
                    {selected.lost_at && <p style={{ fontSize: '.58rem', color: 'var(--muted)', marginTop: 6 }}>{new Date(selected.lost_at).toLocaleString('ja')}</p>}
                  </div>
                  {(() => {
                    // 復活は不成立から90日以内のみ。戻すと active になり金額編集が可能に。frozen/payout 無改修。
                    const days = selected.lost_at ? Math.floor((Date.now() - new Date(selected.lost_at).getTime()) / 86_400_000) : null
                    const canReopen = days != null && days <= 90
                    return canReopen ? (
                      <button onClick={() => reopenDeal(selected)} disabled={pending} className="btn btn-g" style={{ fontSize: '.72rem', padding: '9px 14px', marginTop: 12 }}>
                        対応中に戻す（復活）{days != null && <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 6 }}>· 残り{90 - days}日</span>}
                      </button>
                    ) : (
                      <p style={{ fontSize: '.62rem', color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>
                        復活期限切れ（不成立から90日を超えたため、この案件は復活できません）。
                      </p>
                    )
                  })()}
                </div>
              ) : (
                <>
                  <div style={{ marginTop: 18 }}>
                    <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>ステータス変更</p>
                    {/* L3: 明細0件は成約不可（成約ボタン無効化＋ヒント）。 */}
                    {NEXT[selected.status] === 'confirmed' && (selected.deal_items?.length ?? 0) === 0 && (
                      <p style={{ fontSize: '.62rem', color: 'var(--amber)', marginBottom: 8, lineHeight: 1.6 }}>サービス明細を1つ以上追加すると成約できます。</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {NEXT[selected.status] && (() => {
                        const blockConfirm = NEXT[selected.status] === 'confirmed' && (selected.deal_items?.length ?? 0) === 0
                        return (
                          <button onClick={() => updateStatus(selected, NEXT[selected.status]!)} disabled={pending || blockConfirm} className="btn btn-p" style={{ fontSize: '.72rem', padding: '9px 14px', opacity: blockConfirm ? .5 : 1 }}>
                            → {COLS.find(c => c.key === NEXT[selected.status])?.label}
                          </button>
                        )
                      })()}
                      {PREV[selected.status] && (
                        <button onClick={() => updateStatus(selected, PREV[selected.status]!)} disabled={pending} className="btn btn-g" style={{ fontSize: '.72rem', padding: '9px 14px' }}>
                          ← {COLS.find(c => c.key === PREV[selected.status])?.label}
                        </button>
                      )}
                      {selected.status !== 'paid' && (
                        <button onClick={() => updateStatus(selected, 'lost')} disabled={pending} style={{ fontSize: '.72rem', padding: '9px 14px', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                          不成立にする
                        </button>
                      )}
                    </div>
                  </div>

                  {selected.status !== 'paid' && (
                    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 8 }}>管理操作</p>
                      <button onClick={() => cancelDeal(selected)} disabled={pending} style={{ fontSize: '.7rem', color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
                        案件を取り消し
                      </button>
                    </div>
                  )}
                </>
              ))}
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
              <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', margin: '16px 0 6px' }}>{baseModal.baseLabel}（円）</label>
              <input
                autoFocus
                inputMode="numeric"
                value={baseInput}
                onChange={e => setBaseInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmWithBase() }}
                placeholder="例: 300000"
                style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'Inter', fontSize: '.9rem' }}
              />
              <div style={{ marginTop: 12, padding: '11px 14px', background: 'var(--blue-bg2)', borderRadius: 10, fontSize: '.74rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--muted2)' }}>確定報酬（{baseModal.rate}%）</span>
                <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)', fontSize: '.95rem' }}>{preview != null ? `¥${preview.toLocaleString()}` : '—'}</b>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setBaseModal(null)} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={confirmWithBase} disabled={pending || preview == null} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px' }}>成約確定する</button>
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
            <b style={{ fontSize: '.92rem', display: 'block' }}>不成立（見送り）にする</b>
            <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>
              {lostModal.customer_name} — 成功報酬制のため報酬は発生しません。記録は保持され、後から再開できます。
            </p>
            <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', margin: '16px 0 8px' }}>失注理由</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {LOST_REASONS.map(r => (
                <button key={r} onClick={() => setLostReason(r)}
                  style={{ fontSize: '.7rem', padding: '7px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                    border: `1.5px solid ${lostReason === r ? 'var(--red)' : 'var(--line)'}`,
                    background: lostReason === r ? 'var(--red-bg)' : '#fff', color: lostReason === r ? 'var(--red)' : 'var(--txt)' }}>
                  {r}
                </button>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', margin: '16px 0 6px' }}>メモ（任意）</label>
            <textarea value={lostNote} onChange={e => setLostNote(e.target.value)} rows={2} placeholder="補足があれば"
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '10px 12px', fontFamily: 'inherit', fontSize: '.8rem', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setLostModal(null)} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
              <button onClick={confirmLost} disabled={pending || !lostReason} style={{ fontSize: '.74rem', padding: '9px 18px', borderRadius: 8, border: 'none', cursor: lostReason ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 700, background: 'var(--red)', color: '#fff', opacity: (pending || !lostReason) ? .5 : 1 }}>
                不成立にする
              </button>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* F-3a: 直営業プロジェクト起票モーダル。intake=direct → API が MB直営(is_system)・confirmed・amount=0・未着手 で作成。
           受注額は deal_items.revenue（MB粗利）へ／パートナー報酬には非流入。MB直営は裏方で一覧に出さない。 */}
      {directModal && (
        <div onClick={() => !directBusy && setDirectModal(false)} className="modal-fade" style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 430, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: '22px 24px', boxShadow: '0 24px 64px rgba(14,14,20,.24)' }}>
            <b style={{ fontSize: '.92rem' }}>直営業プロジェクトを起票</b>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '6px 0 16px', lineHeight: 1.6 }}>商談を経ず確定したプロジェクトを作成します（フェーズ＝プロジェクト／状態＝未着手）。受注額はMB粗利に反映され、パートナー報酬には入りません。</p>
            <label style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 700 }}>お客様名</label>
            <input value={directForm.customer_name} disabled={directBusy} autoFocus onChange={e => setDirectForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="お客様名 / 企業名"
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.8rem', margin: '5px 0 14px' }} />
            <label style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 700 }}>サービス</label>
            <select value={directForm.service_id} disabled={directBusy} onChange={e => setDirectForm(f => ({ ...f, service_id: e.target.value }))}
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.8rem', margin: '5px 0 14px', background: '#fff' }}>
              <option value="">選択してください</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label style={{ fontSize: '.64rem', color: 'var(--muted2)', fontWeight: 700 }}>受注額（任意・MB粗利の売上）</label>
            <input value={directForm.revenue} disabled={directBusy} inputMode="numeric" onChange={e => setDirectForm(f => ({ ...f, revenue: e.target.value }))} placeholder="例) 300000"
              style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '9px 12px', fontFamily: 'Inter', fontSize: '.8rem', margin: '5px 0 18px', textAlign: 'right' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDirectModal(false)} disabled={directBusy} style={{ border: '1.5px solid var(--line)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, padding: '8px 16px', borderRadius: 8, color: 'var(--muted2)' }}>キャンセル</button>
              <button onClick={createDirectProject} disabled={directBusy} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 800, padding: '8px 18px', borderRadius: 8, color: '#fff', background: 'var(--c-blue)', opacity: directBusy ? .6 : 1 }}>{directBusy ? '作成中…' : '起票する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
