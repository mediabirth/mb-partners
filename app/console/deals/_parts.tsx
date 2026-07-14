'use client'
// 通水P2「束削減」: /console/deals の純粋部品（型・ヘルパー・表示専用コンポーネント）を分離。
//   page.tsx（ボード）と DealDrawer.tsx（遅延ドロワー）が共有。挙動・money 不変＝表示/計算の意味は原典のまま。
import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { DEAL_STATUS } from '@/lib/status'
import { phaseOf } from '@/lib/phase'


export type Deal = {
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
  // ベンダー純化P2: 受注額の乖離琥珀フラグ（表示専用・入力ミス検出兼用・money非接触）
  _rev_flag?: { median: number | null; n: number; kind: string } | null
}

// N: 失注理由（選択式）
export const LOST_REASONS = ['予算', 'タイミング', '競合', '連絡途絶', 'ニーズ不一致', 'お客様都合', 'その他'] as const

export type Service = { id: string; name: string; icon: string; color: string }
// L2: 案件明細（A1: revenue=受注額/売上）
export type DealItem = { id: string; service_id: string; menu_id?: string | null; kind: string; amount: number; base_amount: number | null; revenue?: number | null; sort: number; services?: { name: string } | null }
export type Director = { id: string; name: string; role: string; color: string }
// A2a: デリバリー（C1: service_id＝得意サービス。null=全サービス扱い）
export type DeliveryOpt = { id: string; name: string; kind: string | null; service_id?: string | null }
// A2b: 経費申請（割当単位）
export type Expense = { id: string; delivery_assignment_id: string; kind: string; amount: number; status: string; has_evidence?: boolean; note?: string | null }
export type DeliveryAssign = { id: string; deal_item_id: string | null; delivery_id: string | null; base_fee: number; status?: string; deliveries?: { name: string; kind: string | null } | null; _expenses?: Expense[] }
export type SvcMenu = { id: string; name: string; ref_type?: string | null; ref_value?: number | null; coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null }
export type SvcWithMenus = { id: string; name: string; service_menus?: SvcMenu[] }

// ⑧ Determine whether a deal's reward is %-based (needs a real-amount base).
// cooperation → selected menu's coop_* (fixed = no base)。協力dealはmenu_idバックフィル済でメニュー一本化。
// 継続報酬（毎月）の情報。月次入力は continuous_payouts、率は凍結 snapshot、期間は deal 優先。
export function continuousInfo(d: Deal): { isContinuous: boolean; rate: number; months: number | null } {
  const rs = d.reward_snapshot as { reward_type?: string; reward_value?: number; months?: number } | null
  if (rs?.reward_type === 'continuous') return { isContinuous: true, rate: Number(rs.reward_value ?? 0), months: d.continuous_months ?? rs.months ?? null }
  return { isContinuous: false, rate: 0, months: null }
}
export function rateInfo(d: Deal): { isRate: boolean; rate: number | null; baseLabel: string } {
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
export function needsBase(d: Deal): boolean {
  return rateInfo(d).isRate && (d.base_amount == null)
}

// ── ライフサイクル（勝彦定義の業務フローをそのまま画面のステートマシンに）──
// nego: 受付/商談（金額系UIはレンダリングしない）／project: 成約後（デリバリー・計算式）／settled: 支払済（読み取り専用）／lost: 記録閲覧
export type LifecyclePhase = 'nego' | 'project' | 'settled' | 'lost'
export function lifecyclePhase(d: Deal): LifecyclePhase {
  if (d.status === 'paid') return 'settled'
  if (d.status === 'lost') return 'lost'
  if (d.status === 'confirmed') return 'project'
  return 'nego'
}

// 報酬ベース語の表示正規化（DB値 '利益' は勝彦語彙では「粗利」）。
export function baseWord(label: string | null | undefined): string {
  const b = label ?? '粗利'
  return b === '利益' ? '粗利' : b
}

// ヘッダ素性行の報酬条件＋トリガー（例「¥30,000（固定）・成約時」「粗利の20%・粗利確定時」）。
// reward_snapshot／メニュー正典から導出（rateInfo/continuousInfo と同じ解決順・表示専用）。
export function rewardTermLine(d: Deal): string | null {
  const cont = continuousInfo(d)
  if (cont.isContinuous) return `継続 粗利の${cont.rate}%/月${cont.months ? `・${cont.months}ヶ月` : ''}・月次確定`
  const ri = rateInfo(d)
  if (ri.isRate) {
    const bw = baseWord(ri.baseLabel)
    return `${bw}の${ri.rate}%・${bw === '売上' ? '成約時' : '粗利確定時'}`
  }
  if (d.intake_type === 'direct') return null // 直営業＝パートナー報酬なし（素性は「ブランド ─ メニュー」で完結）
  if (d.status === 'confirmed' || d.status === 'paid') {
    return d.amount > 0 ? `¥${d.amount.toLocaleString()}（固定）・成約時` : null
  }
  // 成約前の固定：snapshotの条件値（無ければ現在のamount）
  const rv = Number(d.reward_snapshot?.ref_value ?? 0)
  const v = rv > 0 ? rv : d.amount
  return v > 0 ? `¥${v.toLocaleString()}（固定）・成約時` : null
}

// 紹介ソースの日本語化（内部値の生露出禁止）。
export const SOURCE_LABEL: Record<string, string> = {
  partner_form: 'パートナーフォームから',
  manual: '手入力',
  synapse: 'Synapse連携',
}
export function sourceLine(d: Deal): string {
  const label = SOURCE_LABEL[d.source] ?? '登録'
  const dt = d.created_at ? new Date(d.created_at) : null
  const when = dt ? `・${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}` : ''
  return `${label}${when}`
}

// 報酬控除前のMB粗利（＝勝彦定義: 受注額 − 委託費 − 経費 − その他原価。率報酬のbaseはこの値）。
// computeProjectPnl と同じ入力から partnerReward=0 で導出＝式の意味は lib/pnl と完全整合。
export function grossBeforeReward(d: Deal): number {
  const revenue = (d.deal_items ?? []).reduce((s, it) => s + (it.revenue ?? 0), 0)
  return revenue - (d._frontier_override ?? 0) - (d.other_cost ?? 0) - (d._delivery_cost ?? 0) - (d._delivery_expense ?? 0)
}
// メニュー名（APP正典 app/app/cases/[id] と同じ解決順：新名称 menus.name 優先 → service_menus.name）。
export function menuLabelOf(d: Deal): string | null {
  return d._menu_name ?? d.service_menus?.name ?? null
}

// 失注理由の表示ラベル（'お客様都合' はDB保存値のため値は変えず、表示のみ規範「お客さま」に揃える）。
export function lostReasonLabel(r: string): string {
  return r === 'お客様都合' ? 'お客さま都合' : r
}

// v2.2：列ヘッダの塗り分け（accentBg）は撤去。ヘッダは 6pxドット（--st-* 意味色）＋テキストで示す。
export const COLS = [
  { key: 'received',    label: '受付' },
  { key: 'in_progress', label: '対応中' },
  { key: 'confirmed',   label: '成約' },
  { key: 'paid',        label: '支払済' },
  { key: 'lost',        label: '不成立' },
] as const

export type Status = typeof COLS[number]['key']

// 静音化v2: 案件詳細「進行」の縦タイムライン（DealStepper横4段の代替＝表示のみ・onClick/mutationなし）。
// 段階・順序・ラベルは lib/status.ts(SSoT)から導出。lostは「不成立」終端項目（lost_at/理由）。
export const DEAL_FLOW = ['received', 'in_progress', 'confirmed', 'paid'] as const
export function StatusTimeline({ deal }: { deal: Deal }) {
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
export function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', margin: first ? '0 0 12px' : '22px 0 12px' }}>
      {children}
    </p>
  )
}
// 静音化v2(C): レーンの3面写像は常時表示せず、ホバー/クリックのツールチップへ退避（statusTranslation正典由来）。
export function MappingTip({ partner, vendor, children }: { partner: string; vendor: string; children: React.ReactNode }) {
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
export const BOARD_KEYS: string[] = ['received', 'in_progress', 'confirmed']
// 通常フローは線形（不成立は別操作・再開可能）。前進は OPS_NEXT_ACTION（正典）駆動のCTAに一本化＝NEXTマップは廃止。
export const PREV: Record<string, Status | null> = {
  received: null, in_progress: 'received', confirmed: 'in_progress', paid: 'confirmed', lost: null,
}

// F-3a: フェーズ×ステータスのパイプライン・レーン。商談(status由来)→プロジェクト(project_status由来)。
//   group=shodan は deals.status、group=project は project_status を担当（直営業は商談を飛ばしプロジェクトへ）。
export type Lane = { key: string; label: string; group: 'shodan' | 'project'; tone: 'warn' | 'progress' | 'success' | 'danger' | 'neutral' }
export const SHODAN_LANES: Lane[] = [
  { key: 'received',    label: '受付',   group: 'shodan', tone: 'warn' },
  { key: 'in_progress', label: '商談中', group: 'shodan', tone: 'progress' },
]
// 純化バッチ(B): プロジェクトレーンは「納品」を軸に2レーンへ統合。
//   進行中（納品前）／納品済み（＝経費申請・粗利確定のゲート）。旧6値は表示写像で吸収（project_status は非破壊deprecate）。
//   レーンは手動 project_status ではなく「デリバリー割当の納品signal」から導出＝更新されない第二の真実を排除。
export const PROJECT_LANES: Lane[] = [
  { key: '進行中',   label: '進行中',   group: 'project', tone: 'progress' },
  { key: '納品済み', label: '納品済み', group: 'project', tone: 'success' },
]
export const PIPELINE_LANES: Lane[] = [...SHODAN_LANES, ...PROJECT_LANES]
// プロジェクトのレーン導出（納品signal）: 了承済/納品済みの割当が全て納品済み→「納品済み」、それ以外→「進行中」。
export function projectLaneOf(d: { _deliveries?: { delivery_id: string | null; status?: string }[] }): string {
  const asgs = (d._deliveries ?? []).filter(a => a.delivery_id)
  const active = asgs.filter(a => ['accepted', 'assigned', 'delivered'].includes(a.status ?? 'assigned'))
  if (active.length > 0 && active.every(a => a.status === 'delivered')) return '納品済み'
  return '進行中'
}
// 案件が属するレーンキー（商談=status／プロジェクト=納品signal導出）。
export function laneKeyOf(d: { status: string; intake_type?: string | null; project_status?: string | null; _phase?: 'shodan' | 'project'; _deliveries?: { delivery_id: string | null; status?: string }[] }): string {
  const phase = d._phase ?? phaseOf(d)
  if (phase === 'shodan') return d.status                 // received | in_progress
  return projectLaneOf(d)
}

// A2b: 割当ごとの経費（一覧＋承認/却下＋追加＋領収書プレビュー）。
export const EXP_KINDS = ['交通', '宿泊', 'その他'] as const
export function DeliveryExpenses({ assign, editable, busy, onAdd, onStatus, onDelete, onView }: {
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
export function DeliveryOptGroups({ opts, serviceId }: { opts: DeliveryOpt[]; serviceId: string | null }) {
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


export type DrawerCtx = {
  deals: Deal[]
  services: Service[]
  directors: Director[]
  deliveriesOpt: DeliveryOpt[]
  dealTasks: { id: string; label: string; kind: string; required: boolean; done: boolean; sort: number; note?: string | null }[]
  taskBusy: string | null
  itemBusy: boolean
  manageOpen: boolean
  pending: boolean
  dlvAdd: { open: boolean; delivery_id: string; fee: string }
  ctaConfirm: { deal: Deal; to: Status; from: string; precondition?: string; reopen?: boolean } | null
  manageRef: React.RefObject<HTMLDivElement | null>
  moneyRef: React.RefObject<HTMLDivElement | null>
  setSelected: React.Dispatch<React.SetStateAction<Deal | null>>
  setManageOpen: React.Dispatch<React.SetStateAction<boolean>>
  setDlvAdd: React.Dispatch<React.SetStateAction<{ open: boolean; delivery_id: string; fee: string }>>
  setCtaConfirm: React.Dispatch<React.SetStateAction<{ deal: Deal; to: Status; from: string; precondition?: string; reopen?: boolean } | null>>
  setRewardModal: React.Dispatch<React.SetStateAction<Deal | null>>
  setCancelConfirm: React.Dispatch<React.SetStateAction<Deal | null>>
  addAssignment: () => void
  addExpense: (assignmentId: string, kind: string, amount: string, file: File | null) => void
  deleteExpense: (expId: string) => void
  openConfirmDialog: (deal: Deal) => void
  patchAssignmentFee: (assignmentId: string, fee: number) => void
  patchItem: (itemId: string, body: Record<string, unknown>) => void
  refreshDeals: (keepId?: string) => void
  removeAssignment: (assignmentId: string) => void
  savePnl: (body: Record<string, unknown>) => void
  setExpenseStatus: (expId: string, status: 'approved' | 'rejected' | 'submitted') => void
  showToast: (msg: string, opts?: { undo?: () => void; duration?: number }) => void
  toggleDealTask: (taskId: string, next: boolean) => void
  updateStatus: (deal: Deal, newStatus: Status) => void
  viewEvidence: (expId: string) => void
}
