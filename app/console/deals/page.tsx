'use client'
// 静音化v2.1: 稟議ステージ(review_stage)は概念廃止＝UI/保存関数を撤去（API /review-stage・DB列・既存データは残置＝コードから到達不能のdeprecate）。
import { useEffect, useState, useTransition, useRef } from 'react'
import ServiceAvatar from '@/components/ServiceAvatar'
import ConsoleNav from '@/components/ConsoleNav'
import { customerHonorific } from '@/lib/customer'
import { phaseOf, PHASE_LABEL } from '@/lib/phase'
import RewardPill from '@/components/ui/RewardPill'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { DEAL_STATUS, assignStatus } from '@/lib/status'
import { engagementLabel } from '@/lib/engagement-labels'
// 操縦席: ステータス翻訳レイヤー（3面写像・遷移の結果予告・次アクション）の単一ソース。文言/写像のハードコード禁止。
import { statusTranslation, projectLaneTranslation, transitionForecast, forecastLine, statusEntryEffects, OPS_NEXT_ACTION, DEAL_STATUS_KEYS } from '@/lib/status-effects'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import PageGuide from '@/components/PageGuide'
import { GUIDE_DEALS } from '@/lib/console-guides'
// 通水P2「束削減」: 詳細ドロワーは案件クリック時のみ取得（dynamic ssr:false）＝ボード初期バンドルから分離。
const DealDrawer = dynamic(() => import('./DealDrawer'), { ssr: false, loading: () => <div style={{ position: 'fixed', top: 0, right: 0, width: 720, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '0.5px solid var(--line)', zIndex: 80 }} className="page-anim" /> })
// 通水P2「束削減」: ステータス×3面マトリクスは参照時のみ取得（dynamic）＝初期バンドルから分離。
const StatusMatrixBody = dynamic(() => import('./StatusMatrixBody'), { ssr: false })
import { LOST_REASONS, continuousInfo, rateInfo, needsBase, baseWord, grossBeforeReward, menuLabelOf, lostReasonLabel, COLS, MappingTip, PIPELINE_LANES, laneKeyOf, DeliveryOptGroups, type Deal, type Service, type Director, type DeliveryOpt, type SvcWithMenus, type Status } from './_parts'
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
  // ライフサイクル: 成約ダイアログ（売上入力＝率/継続/直営。明細0なら明細作成も兼ねる）・報酬確定ダイアログ（粗利=計算値×率）。
  //   旧「実績金額（粗利）を入力」系（baseModal/editingBase）は全廃＝粗利は計算結果であり入力項目ではない。
  const [confirmModal, setConfirmModal] = useState<Deal | null>(null)
  const [confirmRevenue, setConfirmRevenue] = useState('')
  const [confirmSvc, setConfirmSvc] = useState<{ service_id: string; menu_id: string }>({ service_id: '', menu_id: '' })
  const [rewardModal, setRewardModal] = useState<Deal | null>(null)
  // デリバリー提示の追加フォーム（成約後・0〜N行）
  const [dlvAdd, setDlvAdd] = useState<{ open: boolean; delivery_id: string; fee: string }>({ open: false, delivery_id: '', fee: '' })
  // 実装4: タブ廃止→縦1カラム。金額・原価セクションの折りたたみ（received/in_progress のみ・既定閉）。
  //   <details> の open を state と同期し、閉時は中身を非レンダリング＝動的import(DeliveryProgress)は開くまでマウントしない。
  const moneyRef = useRef<HTMLDivElement | null>(null)   // 「明細を追加して成約へ」からのスクロール先
  // 実装2: 波及あり遷移（3面表示変化/メール送信）の確定前確認モーダル。
  const [moveConfirm, setMoveConfirm] = useState<{ deal: Deal; to: Status } | null>(null)
  // 静音化v2(A2): 動詞CTA・管理操作の確認ダイアログ（本文=forecastLine＋precondition・実行する/キャンセル）。
  //   reopen=true は lost→in_progress の復活（reopenDeal＝lost_*クリア）。承認後は既存ガード分岐が関数内で活きる。
  const [ctaConfirm, setCtaConfirm] = useState<{ deal: Deal; to: Status; from: string; precondition?: string; reopen?: boolean } | null>(null)
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
  useEffect(() => { setManageOpen(false); setDlvAdd({ open: false, delivery_id: '', fee: '' }) }, [selected?.id])

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

  // L2: 明細変更後にボードを再取得し選択中dealを更新（deals.amount=Σ・明細を反映）。
  async function refreshDeals(keepId?: string) {
    const d = await fetch('/api/console/deals').then(r => r.json())
    setDeals(d.deals)
    if (keepId) setSelected(d.deals.find((x: Deal) => x.id === keepId) ?? null)
  }
  // 純化バッチ(A/B): 手動 project_status 変更は撤去（レーンは納品signal導出）。setProjectStatusForDeal / saveProjectStatus は廃止。
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
    // ライフサイクル: 率案件も base なしで成約可（報酬確定は成約後の「報酬を確定する」）。旧baseModal分岐は全廃。
    // N: 不成立化は理由入力を挟む（直接PATCHしない）
    if (newStatus === 'lost') {
      if (deal.status === 'paid') { showToast('支払済の案件は不成立にできません'); return }
      setLostReason(''); setLostNote(''); setLostModal(deal)
      return
    }
    // 無音B: 楽観的更新は「表示・状態遷移で金額に影響しないもの」のみ（受付↔商談中）。
    //   確定系（成約confirmed=snapshot凍結・支払済paid・不成立lost）は従来どおりサーバ確定を待つ（CLAUDE.md恒久線引き）。
    const optimistic = (newStatus === 'received' || newStatus === 'in_progress') && deal.status !== 'paid' && deal.status !== 'confirmed'
    const prevStatus = deal.status
    if (optimistic) {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
      if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: newStatus } : d)
    }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (!optimistic) {
          setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: newStatus } : d))
          if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: newStatus } : d)
        }
        showToast(`ステータスを「${COLS.find(c => c.key === newStatus)?.label}」に変更しました`)
      } else {
        if (optimistic) {
          // ロールバック＋明示トースト
          setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, status: prevStatus } : d))
          if (selected?.id === deal.id) setSelected(d => d ? { ...d, status: prevStatus } : d)
          showToast(`${data?.error ?? '更新に失敗しました'}（元の状態に戻しました）`)
        } else {
          showToast(data?.error ?? '更新に失敗しました')
        }
      }
    })
  }

  // ── ライフサイクル: 成約ダイアログ ──
  // 率/継続/直営は受注額（売上）を入力して成約（deal_items.revenue へ保存・報酬計算には不使用）。
  // 明細0件の案件（相談等）はサービス/メニュー選択で明細作成も兼ねる（L3ガードを画面で満たす）。
  function openConfirmDialog(deal: Deal) {
    const rev = (deal.deal_items ?? []).reduce((s, it) => s + (it.revenue ?? 0), 0)
    setConfirmRevenue(rev > 0 ? String(rev) : '')
    setConfirmSvc({ service_id: '', menu_id: '' })
    setConfirmModal(deal)
  }
  function confirmDeal() {
    if (!confirmModal) return
    const deal = confirmModal
    const noItems = (deal.deal_items?.length ?? 0) === 0
    const askRevenue = rateInfo(deal).isRate || continuousInfo(deal).isContinuous || deal.intake_type === 'direct'
    const rev = Math.max(0, Number((confirmRevenue || '').replace(/[,，\s]/g, '')) || 0)
    if (noItems && !confirmSvc.service_id) { showToast('サービスを選択してください'); return }
    startTransition(async () => {
      try {
        let itemId = deal.deal_items?.[0]?.id ?? null
        if (noItems) {
          const res = await fetch(`/api/console/deals/${deal.id}/items`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_id: confirmSvc.service_id, menu_id: confirmSvc.menu_id || null, kind: 'fixed', amount: 0 }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) { showToast(data?.error ?? '明細の作成に失敗しました'); return }
          itemId = data.item?.id ?? null
        }
        if (askRevenue && rev > 0 && itemId) {
          await fetch(`/api/console/deals/${deal.id}/items/${itemId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revenue: rev }),
          }).catch(() => {})
        }
        const res2 = await fetch(`/api/console/deals/${deal.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }),
        })
        const data2 = await res2.json().catch(() => ({}))
        if (!res2.ok) { showToast(data2?.error ?? '成約に失敗しました'); return }
        setConfirmModal(null)
        await refreshDeals(deal.id)
        showToast('成約にしました')
      } catch { showToast('成約に失敗しました') }
    })
  }

  // ── ライフサイクル: 報酬確定（率案件）──
  // 粗利は入力ではなく計算結果（受注額 − 委託費(了承済) − 経費(承認済) − その他原価）。
  // その計算値を base として既存API（base×率＝報酬・snapshot追記）に確定させる＝式の意味は不変。
  function confirmReward() {
    if (!rewardModal) return
    const deal = rewardModal
    const ri = rateInfo(deal)
    const revenue = (deal.deal_items ?? []).reduce((s, it) => s + (it.revenue ?? 0), 0)
    const base = baseWord(ri.baseLabel) === '売上' ? revenue : grossBeforeReward(deal)
    if (!(base > 0)) { showToast('計算値が0以下のため確定できません'); return }
    startTransition(async () => {
      const res = await fetch(`/api/console/deals/${deal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_amount: base }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setRewardModal(null)
        await refreshDeals(deal.id)
        showToast(`報酬を確定しました：¥${Math.round(base * (ri.rate as number) / 100).toLocaleString()}`)
      } else {
        showToast(data?.error ?? '確定に失敗しました')
      }
    })
  }

  // ── ライフサイクル: デリバリー提示（0〜N行・op方式）──
  async function addAssignment() {
    if (!selected || !dlvAdd.delivery_id) return
    const fee = Math.max(0, Number((dlvAdd.fee || '').replace(/[,，\s]/g, '')) || 0)
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/deliveries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'add', delivery_id: dlvAdd.delivery_id, base_fee: fee, deal_item_id: selected.deal_items?.[0]?.id ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(data?.error ?? '提示に失敗しました'); return }
      setDlvAdd({ open: false, delivery_id: '', fee: '' })
      await refreshDeals(selected.id)
      showToast('委託費を提示しました（ベンダーの承諾待ち）')
    } finally { setItemBusy(false) }
  }
  async function removeAssignment(assignmentId: string) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/deliveries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'remove', assignment_id: assignmentId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d?.error ?? '削除に失敗しました'); return }
      await refreshDeals(selected.id)
      showToast('提示を取り下げました')
    } finally { setItemBusy(false) }
  }
  async function patchAssignmentFee(assignmentId: string, fee: number) {
    if (!selected) return
    setItemBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${selected.id}/deliveries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'fee', assignment_id: assignmentId, base_fee: fee }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d?.error ?? '更新に失敗しました'); return }
      await refreshDeals(selected.id)
      showToast('委託費を変更しました（再提示＝ベンダーの承諾待ち）')
    } finally { setItemBusy(false) }
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
      // 商談→プロジェクト列（進行中）へのドロップ＝成約フロー。
      requestStatusMove(deal, 'confirmed')
    } else {
      // 純化バッチ(B): プロジェクトのレーンは納品signal（デリバリー承諾/納品）から導出＝手動移動はしない。
      showToast('納品済みは、デリバリーの「納品済みにする」で決まります')
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
        <div className="console-topbar console-mobile-header" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30 }}>
          <div className="console-mobile-title" style={{ flex: 1 }}>
            <p className="eyebrow" style={{ marginBottom: 2 }}>案件管理</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <h1 style={{ fontSize: '1rem', fontWeight: 500, lineHeight: 1 }}>{view === 'board' ? '案件ボード' : 'アーカイブ'}</h1>
              {/* 実装3: ステータスマトリクス（3面写像＋通知メール）を開くⓘ（SVG・絵文字不使用） */}
              {view === 'board' && (
                <PageGuide data={GUIDE_DEALS} width={680}><StatusMatrixBody /></PageGuide>
              )}
            </div>
          </div>

          {/* QR: ボード / アーカイブ 切替 */}
          <div className="console-mobile-actions" style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3 }}>
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
          {/* F-3a: フェーズ×ステータスのパイプライン。左→右で 商談(受付→商談中)→成約→プロジェクト(進行中→納品済み)。
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
                        // ライフサイクル: 率案件は成約後に粗利計算→報酬確定。未確定＝要対応（成約前は正常状態なので出さない）。
                        d.status === 'confirmed' && needsBase(d) && '報酬が未確定です（粗利の確定待ち）',
                        (d._deliveries ?? []).some(a => a.status === 'proposed') && 'ベンダーの承諾待ちの提示があります',
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
                          {/* ベンダー純化P2: 乖離琥珀（静音・入力ミス検出兼用・保存はブロックしない） */}
                          {d._rev_flag && (
                            <span title={`相場と乖離（参考値 ¥${(d._rev_flag.median ?? 0).toLocaleString()}）— 入力ミスの可能性もご確認ください`} style={{ position: 'absolute', top: 8, right: attentionReasons.length > 0 ? 20 : 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />
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
        <DealDrawer deal={selected} ctx={{ deals, services, directors, deliveriesOpt, dealTasks, taskBusy, itemBusy, manageOpen, pending, dlvAdd, ctaConfirm, manageRef, moneyRef, setSelected, setManageOpen, setDlvAdd, setCtaConfirm, setRewardModal, setCancelConfirm, addAssignment, addExpense, deleteExpense, openConfirmDialog, patchAssignmentFee, patchItem, refreshDeals, removeAssignment, savePnl, setExpenseStatus, showToast, toggleDealTask, updateStatus, viewEvidence }} />
      )}

      {/* ライフサイクル: 成約ダイアログ（売上入力＝率/継続/直営・明細0はサービス選択を兼ねる・forecastは本文で語る） */}
      {confirmModal && (() => {
        const deal = confirmModal
        const noItems = (deal.deal_items?.length ?? 0) === 0
        const askRevenue = rateInfo(deal).isRate || continuousInfo(deal).isContinuous || deal.intake_type === 'direct'
        const csvc = svcMenus.find(x => x.id === confirmSvc.service_id)
        return (
          <>
            <div onClick={() => setConfirmModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block' }}>{customerHonorific(deal)}を成約にしますか</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>{forecastLine(deal.status, 'confirmed')}</p>
              {noItems && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>サービス</label>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <select value={confirmSvc.service_id} onChange={e => setConfirmSvc({ service_id: e.target.value, menu_id: '' })}
                      style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.74rem', background: '#fff' }}>
                      <option value="">選択してください</option>
                      {svcMenus.map(sv => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
                    </select>
                    {(csvc?.service_menus?.length ?? 0) > 0 && (
                      <select value={confirmSvc.menu_id} onChange={e => setConfirmSvc(f => ({ ...f, menu_id: e.target.value }))}
                        style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.74rem', background: '#fff' }}>
                        <option value="">メニュー（任意）</option>
                        {(csvc?.service_menus ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
              {askRevenue && (
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 6 }}>受注額（売上・税抜）</label>
                  <input autoFocus inputMode="numeric" value={confirmRevenue} onChange={e => setConfirmRevenue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmDeal() }} placeholder="例：500000"
                    style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'Inter', fontSize: '.9rem', textAlign: 'right' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmModal(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={confirmDeal} disabled={pending} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>成約にする</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* ライフサイクル: 報酬確定ダイアログ — 粗利は入力ではなく計算結果。計算内訳をそのまま提示して確定する。 */}
      {rewardModal && (() => {
        const deal = rewardModal
        const ri = rateInfo(deal)
        const revenue = (deal.deal_items ?? []).reduce((s2, it) => s2 + (it.revenue ?? 0), 0)
        const bw = baseWord(ri.baseLabel)
        const base = bw === '売上' ? revenue : grossBeforeReward(deal)
        const reward = base > 0 ? Math.round(base * (ri.rate as number) / 100) : null
        const pendingOffers = (deal._deliveries ?? []).filter(a => a.status === 'proposed').length
        return (
          <>
            <div onClick={() => setRewardModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
            <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
              <b style={{ fontSize: '.92rem', display: 'block' }}>報酬を確定しますか</b>
              <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
                {bw}（計算値）×{ri.rate}%でパートナー報酬を確定します。確定後は報酬一覧・支払集計に反映されます。
              </p>
              <div style={{ marginTop: 12, padding: '11px 14px', background: 'var(--blue-bg2)', borderRadius: 10, fontSize: '.72rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span style={{ color: 'var(--muted2)' }}>{bw}（計算値）</span><b className="tnum" style={{ fontFamily: 'Inter' }}>¥{base.toLocaleString()}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span style={{ color: 'var(--muted2)' }}>報酬（{ri.rate}%）</span><b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)', fontSize: '.9rem' }}>{reward != null ? `¥${reward.toLocaleString()}` : '—'}</b></div>
              </div>
              {pendingOffers > 0 && (
                <p style={{ fontSize: '.64rem', color: 'var(--amber)', marginTop: 10, lineHeight: 1.6 }}>承諾待ちの委託提示が{pendingOffers}件あります（未了承の委託費は計算に含まれていません）。</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                <button onClick={() => setRewardModal(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                <button onClick={confirmReward} disabled={pending || reward == null} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>確定する</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* N: 不成立化モーダル（理由＋メモ） */}
      {lostModal && (
        <>
          <div onClick={() => setLostModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
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
          <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
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
            <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
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
            <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
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
