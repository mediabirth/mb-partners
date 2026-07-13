'use client'
// 通水P2「束削減」: 案件詳細ドロワー。案件クリック時のみ dynamic(ssr:false) で取得＝ボード初期バンドルから分離。
//   JSX/計算は原典を1:1移設（selected→deal）。状態/ハンドラは page.tsx から ctx で受領＝money/状態の単一ソース不変。
import * as React from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import RewardPill from '@/components/ui/RewardPill'
import Button from '@/components/ui/Button'
import { customerHonorific } from '@/lib/customer'
import PageGuide from '@/components/PageGuide'
import { GUIDE_DEAL_DRAWER } from '@/lib/console-guides'
import { phaseOf, PHASE_LABEL } from '@/lib/phase'
import { DEAL_STATUS, assignStatus } from '@/lib/status'
import { engagementLabel } from '@/lib/engagement-labels'
import { statusTranslation, projectLaneTranslation, transitionForecast, forecastLine, statusEntryEffects, OPS_NEXT_ACTION, DEAL_STATUS_KEYS } from '@/lib/status-effects'
import { continuousInfo, rateInfo, needsBase, lifecyclePhase, baseWord, rewardTermLine, sourceLine, grossBeforeReward, menuLabelOf, COLS, StatusTimeline, SectionLabel, PREV, DeliveryExpenses, DeliveryOptGroups, type Deal, type DrawerCtx } from './_parts'
const ContinuousMonthly = dynamic(() => import('./ContinuousMonthly'), { ssr: false, loading: () => <div className="ui-skeleton" style={{ height: 200, borderRadius: 12, marginTop: 18 }} /> })

export default function DealDrawer({ deal, ctx }: { deal: Deal; ctx: DrawerCtx }) {
  const { services, directors, deliveriesOpt, dealTasks, taskBusy, itemBusy, manageOpen, pending, dlvAdd, ctaConfirm, manageRef, moneyRef, setSelected, setManageOpen, setDlvAdd, setCtaConfirm, setRewardModal, setCancelConfirm, addAssignment, addExpense, deleteExpense, openConfirmDialog, patchAssignmentFee, patchItem, refreshDeals, removeAssignment, savePnl, setExpenseStatus, showToast, toggleDealTask, updateStatus, viewEvidence } = ctx
  // ベンダー純化P1: 納品済みの宣言（vendor面から移管）。波及あり操作＝ripple文法（結果予告→確定）で確認を挟む。
  const [deliverConfirm, setDeliverConfirm] = React.useState<{ id: string; name: string; fee: number } | null>(null)
  const [deliverBusy, setDeliverBusy] = React.useState(false)
  async function markDelivered(assignmentId: string) {
    setDeliverBusy(true)
    try {
      const res = await fetch(`/api/console/deals/${deal.id}/deliveries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'deliver', assignment_id: assignmentId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); showToast(d?.error ?? '更新に失敗しました'); return }
      await refreshDeals(deal.id)
      showToast('納品済みにしました')
    } finally { setDeliverBusy(false); setDeliverConfirm(null) }
  }
  return (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
          {/* 狭幅（375px相当）では1カラム＝従来の縦スクロールに落とす（コンソールはPC前提・破綻回避のみ） */}
          <style>{`@media (max-width: 640px){ .deal-drawer-body{ grid-template-columns: 1fr !important } .deal-drawer-right{ border-left: none !important } } @keyframes manage-menu-in{from{opacity:0}to{opacity:1}}`}</style>
          <div style={{ position: 'fixed', top: 0, right: 0, width: 720, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '0.5px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)' }}>
            {/* A1: ヘッダ1行 — ロゴ36px＋お客さま名16px/500＋「ブランド ─ メニュー」12px/muted。右にステータス（7pxドット＋語・dealStatus正典）＋報酬ピル＋✕ */}
            <div style={{ padding: '14px 22px', borderBottom: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
              {deal.services
                ? <ServiceAvatar logoPath={(deal.services as any).logo_path ?? null} icon={deal.services.icon} color={deal.services.color} name={deal.services.name} size={36} />
                : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="相談" size={36} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerHonorific(deal)}</div><PageGuide data={GUIDE_DEAL_DRAWER} /></div>
                {/* ライフサイクル: 素性行＝「ブランド ─ メニュー・報酬条件・トリガー」を常時表示（reward_snapshot/正典から導出） */}
                <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[
                    deal.services?.name ? `${deal.services.name}${menuLabelOf(deal) ? ` ─ ${menuLabelOf(deal)}` : ''}` : '相談（サービス未定）',
                    rewardTermLine(deal),
                  ].filter(Boolean).join('・')}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[deal.status]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{DEAL_STATUS[deal.status]?.label ?? deal.status}</span>
              </span>
              {deal.amount > 0 && <RewardPill><span className="tnum" style={{ fontFamily: 'Inter' }}>¥{deal.amount.toLocaleString()}</span></RewardPill>}
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
                  const locked = deal.status === 'paid' || deal.status === 'lost'
                  const item = (label: string, onClick: () => void) => (
                    <button onClick={() => { setManageOpen(false); onClick() }} disabled={locked || pending}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', borderRadius: 7, fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: locked ? 'var(--muted)' : 'var(--red)', cursor: locked ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                      {label}
                    </button>
                  )
                  return (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 10, boxShadow: '0 8px 28px rgba(14,14,20,.14)', padding: 4, minWidth: 148, animation: 'manage-menu-in 120ms var(--ease-out)' }}>
                      {item('不成立にする', () => updateStatus(deal, 'lost'))}
                      {item('案件を取り消す', () => setCancelConfirm(deal))}
                    </div>
                  )
                })()}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>

            {/* ライフサイクル: 焦点＝動詞ボタン1つ（フェーズが決める次の一手）。
                受付→対応中: 正典CTA（確認ダイアログ）／対応中→成約: 成約ダイアログ（率/継続/直営は売上入力・明細0は明細作成を兼ねる）／
                成約×率×報酬未確定: 報酬を確定する（粗利=計算値×率のダイアログ）／成約→支払済: 正典CTA（率はサーバ側で報酬未確定を拒否）／
                lost90日内→再開／paid→非表示（ステータス行が完了を語る）。 */}
            {(() => {
              const st = deal.status
              const nextAct = OPS_NEXT_ACTION[st as keyof typeof OPS_NEXT_ACTION] ?? null
              let act: { label: string; onClick: () => void } | null = null
              if (st === 'in_progress') {
                act = { label: '成約にする', onClick: () => openConfirmDialog(deal) }
              } else if (st === 'confirmed' && needsBase(deal)) {
                act = { label: '報酬を確定する', onClick: () => setRewardModal(deal) }
              } else if (nextAct) {
                act = { label: nextAct.cta, onClick: () => setCtaConfirm({ deal: deal, to: nextAct.to, from: st, precondition: nextAct.precondition }) }
              } else if (st === 'lost') {
                const days = deal.lost_at ? Math.floor((Date.now() - new Date(deal.lost_at).getTime()) / 86_400_000) : null
                if (days != null && days <= 90) act = { label: '案件を再開する', onClick: () => setCtaConfirm({ deal: deal, to: 'in_progress', from: 'lost', reopen: true }) }
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
              <StatusTimeline deal={deal} />

              {/* 純化バッチ(A): 手動「プロジェクト状態」selectは撤去＝更新されない第二の真実の排除。
                  進行/納品はデリバリー割当の納品signalで決まる（ボードのレーンと下の委託行が語る）。 */}

              {/* P: 報酬ゲート判定（協力で必須タスク未達→紹介レート）— 枠なしテキスト（表示専用・判定不変） */}
              {deal.channel === 'cooperation' && deal.reward_snapshot?.gate_reason && (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--amber)' }}>対応範囲が未達のため、固定報酬で確定</p>
                  <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 3, lineHeight: 1.6 }}>{deal.reward_snapshot.gate_reason}</p>
                </div>
              )}
              {deal.channel === 'cooperation' && deal.reward_snapshot?.effective_kind === 'cooperation' && (
                <p style={{ marginTop: 14, fontSize: '.64rem', fontWeight: 500, color: 'var(--green)' }}>対応範囲をすべて満たし、成果報酬（粗利%）で確定</p>
              )}

              {/* ④ 対応範囲（協力タスク）の管理側チェック：運営が確認して done を立てる（必須全達成→協力レート確定の入力）。
                  静音化v2: カード枠・常設説明文なし＝0.5px罫線と余白のみ。 */}
              {deal.channel === 'cooperation' && dealTasks.length > 0 && (
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
                          {/* ライフサイクル静音化: 完了は打ち消し線でなくチェック＋muted。ピルは必要情報（未達の必須）のみ・「自動」はtitleへ。 */}
                          <span title={auto ? 'ステータス遷移で自動的に完了します' : undefined} style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, color: t.done ? 'var(--muted2)' : 'var(--txt)' }}>
                            {t.label}
                            {t.note && (
                              <span style={{ display: 'block', fontSize: '.66rem', fontWeight: 400, color: 'var(--txt)', whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4, padding: '8px 10px', background: 'var(--bg2)', borderRadius: 8 }}>{t.note}</span>
                            )}
                          </span>
                          {t.required && !t.done && <span style={{ flexShrink: 0, fontSize: '.5rem', fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '1px 7px' }}>必須</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ライフサイクル: 旧「実績金額（粗利）を入力」ブロックは全廃＝粗利は計算式ブロックの計算結果・報酬確定はヘッダCTA。 */}

              {/* 継続報酬：月次入力セクション（継続案件のみ・通常案件には出さない）【進行セクション】 */}
              {continuousInfo(deal).isContinuous && (
                <ContinuousMonthly deal={deal} onChanged={() => refreshDeals(deal.id)} />
              )}

              {/* N: 不成立の詳細（理由/メモ/日時）はタイムライン終端項目へ・再開（90日内）はヘッダCTA「案件を再開する」へ再配置。 */}

              {/* 管理操作 — ←戻すのみ（A3: 不成立にする/案件を取り消すはヘッダ「…」メニューへ移設）。
                  戻すは押下時ダイアログ（ctaConfirm=forecastLine）。ハンドラ不変。 */}
              {deal.status !== 'lost' && PREV[deal.status] && (
                <div style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                  <SectionLabel first>管理操作</SectionLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                    {(() => {
                      const to = PREV[deal.status]!
                      return (
                        <button onClick={() => setCtaConfirm({ deal: deal, to, from: deal.status })} disabled={pending} title={forecastLine(deal.status, to)}
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
                {deal.customer_email ? (
                  <>
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{deal.customer_email}</span>
                    <button onClick={() => { const v = deal.customer_email!; navigator.clipboard?.writeText(v).then(() => showToast('メールアドレスをコピーしました')).catch(() => {}) }}
                      title="コピー" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 500, color: 'var(--c-blue)', flexShrink: 0 }}>
                      コピー
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--muted2)' }}>—</span>
                )}
              </div>

              {/* 紹介（ライフサイクル）: パートナー名＋ソースの日本語化（partner_form等の内部値は生で出さない） */}
              <div style={{ marginTop: 12 }}>
                {([
                  ['紹介', deal.intake_type === 'direct' ? '直営業' : sourceLine(deal)],
                  ['パートナー', deal.partners ? `${deal.partners.profiles?.name ?? ''} (${deal.partners.code})` : '—'],
                ] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                  </div>
                ))}
                {/* 静音化v2.1(B2): MB担当＝担当情報として常時可視（金額・原価の折りたたみから移設）。保存はsavePnl（楽観更新つき）。 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', flexShrink: 0 }}>MB担当</span>
                  <select value={deal.director_id ?? ''} onChange={e => savePnl({ director_id: e.target.value || null })} disabled={itemBusy}
                    style={{ border: '0.5px solid var(--line)', borderRadius: 8, padding: '5px 9px', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, background: '#fff', color: 'var(--txt)', minWidth: 0, maxWidth: 180 }}>
                    <option value="">未割当</option>
                    {directors.map(d => <option key={d.id} value={d.id}>{d.name}（{d.role}）</option>)}
                  </select>
                </div>
                {deal.contact_title && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--line)', fontSize: 12, alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted2)', flexShrink: 0 }}>部署・役職</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{deal.contact_title}</span>
                  </div>
                )}
              </div>

              {/* ヒアリング（協力タスクのヒアリングnote。無ければ「—」） */}
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', margin: '18px 0 8px' }}>ヒアリング</p>
              {(() => {
                // ライフサイクル: 単一コンテンツ（ヒヤリングタスクのnote・パートナー編集制）。長文は折りたたみで全文表示。
                const note = dealTasks.find(t => t.note && t.note.trim())?.note?.trim() ?? null
                if (!note) return <p style={{ fontSize: 12, color: 'var(--muted2)' }}>—</p>
                if (note.length <= 220) return <p style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{note}</p>
                return (
                  <details>
                    <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', display: 'block' }}>{note.slice(0, 220)}…</span>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--c-blue)' }}>すべて表示</span>
                    </summary>
                    <p style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginTop: 4 }}>{note.slice(220)}</p>
                  </details>
                )
              })()}

              {/* ライフサイクル: 金額ゾーンはフェーズが決める。
                  nego（受付/商談）＝一切レンダリングしない（金額系UIはDOM不在）。
                  project（成約後）＝①デリバリー提示 0〜N行 ②計算式ブロック（粗利＝計算結果・入力は売上/委託費/その他原価のみ）③明細。
                  settled/lost＝同構造の読み取り専用。固定報酬×コスト無しは計算式ブロック自体を出さない（素性行が報酬を語る）。 */}
              {(() => {
                const phase = lifecyclePhase(deal)
                if (phase === 'nego') return null
                const items = deal.deal_items ?? []
                const assigns = deal._deliveries ?? []
                const editable = phase === 'project'
                const ri = rateInfo(deal)
                const cont = continuousInfo(deal)
                const revenue = items.reduce((s2, it) => s2 + (it.revenue ?? 0), 0)
                const acceptedCost = deal._delivery_cost ?? 0
                const proposedSum = assigns.filter(a => a.status === 'proposed').reduce((s2, a) => s2 + (a.base_fee ?? 0), 0)
                const expense = deal._delivery_expense ?? 0
                const gross = grossBeforeReward(deal)
                const rewardSettled = !ri.isRate || deal.base_amount != null
                const hasCosts = assigns.length > 0 || (deal.other_cost ?? 0) > 0 || expense > 0 || revenue > 0
                // Feature I: サプライヤー折半（fee_snapshot=half_commission）は受注額が請求ベース＝fixed報酬でも計算式ブロックを出し、
                // 受注額をUIから入力できるようにする（未入力だと月次クローズで折半0円スキップ→再クローズ拾い直しになるため）。
                const feeKind = (deal as { fee_snapshot?: { rate_kind?: string } }).fee_snapshot?.rate_kind
                const isSupplierHalf = feeKind === 'half_commission' || feeKind === 'passthrough_revenue_fee'
                const showFormula = ri.isRate || cont.isContinuous || deal.intake_type === 'direct' || hasCosts || isSupplierHalf
                const projectedReward = ri.isRate
                  ? Math.round(Math.max(0, baseWord(ri.baseLabel) === '売上' ? revenue : gross) * (ri.rate as number) / 100)
                  : deal.amount
                const rewardShown = ri.isRate && !rewardSettled ? projectedReward : deal.amount
                const Row = ({ label, val, minus, strong, quiet }: { label: React.ReactNode; val: number; minus?: boolean; strong?: boolean; quiet?: boolean }) => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: strong ? '10px 0 0' : '4px 0', fontSize: strong ? 13 : '.68rem', fontWeight: 500, borderTop: strong ? '0.5px solid var(--line)' : undefined, marginTop: strong ? 6 : 0, opacity: quiet ? .75 : 1 }}>
                    <span style={{ color: strong ? 'var(--txt)' : 'var(--muted2)' }}>{minus ? '− ' : ''}{label}</span>
                    <span className="tnum" style={{ fontFamily: 'Inter', color: strong ? (val >= 0 ? 'var(--txt)' : 'var(--red)') : 'var(--txt)' }}>{minus && val > 0 ? '−' : ''}¥{Math.abs(val).toLocaleString()}</span>
                  </div>
                )
                return (
                  <div ref={moneyRef}>
                    {/* ① デリバリー（0〜N行・提示→ベンダー了承）。行＝名前＋委託費＋状態ドット＋取り下げ */}
                    <div style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', marginBottom: 6 }}>デリバリー</p>
                      {assigns.length === 0 && !dlvAdd.open && (
                        <p style={{ fontSize: 12, color: 'var(--muted2)', padding: '6px 0' }}>MB自身で対応（委託なし）</p>
                      )}
                      {assigns.map(a => {
                        const ast = assignStatus(a.status)
                        return (
                          <div key={a.id} style={{ padding: '9px 0', borderBottom: '0.5px solid var(--line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '.74rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.deliveries?.name ?? '委託先'}</span>
                              {editable && a.status !== 'declined' ? (
                                <input key={`${deal.id}:${a.id}:fee`} defaultValue={a.base_fee || ''} inputMode="numeric" placeholder="委託費" disabled={itemBusy}
                                  onBlur={e => { const v = Math.max(0, Number(e.target.value.replace(/[,，\s]/g, '')) || 0); if (v !== a.base_fee) patchAssignmentFee(a.id, v) }}
                                  style={{ width: 88, border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                              ) : (
                                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.74rem', fontWeight: 500 }}>¥{(a.base_fee ?? 0).toLocaleString()}</span>
                              )}
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, minWidth: 52 }}>
                                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${ast.tone})` }} />
                                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted2)' }}>{ast.children}</span>
                              </span>
                              {/* ベンダー純化P1: 納品済みの宣言＝発注元（了承済のみ・確認を挟む） */}
                              {editable && ['accepted', 'assigned'].includes(a.status ?? 'assigned') && (
                                <button onClick={() => setDeliverConfirm({ id: a.id, name: a.deliveries?.name ?? '委託先', fee: a.base_fee ?? 0 })} disabled={itemBusy || deliverBusy}
                                  style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 500, color: 'var(--c-blue)' }}>納品済みにする</button>
                              )}
                              {editable && (
                                <button onClick={() => removeAssignment(a.id)} disabled={itemBusy} title="提示を取り下げる"
                                  style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.8rem' }}>✕</button>
                              )}
                            </div>
                            {/* 経費（割当単位・ベンダー申請→承認）。承認済のみ粗利に算入。 */}
                            <DeliveryExpenses assign={a} editable={editable} busy={itemBusy}
                              onAdd={addExpense} onStatus={setExpenseStatus} onDelete={deleteExpense} onView={viewEvidence} />
                          </div>
                        )
                      })}
                      {editable && !dlvAdd.open && (
                        <button onClick={() => setDlvAdd({ open: true, delivery_id: '', fee: '' })} disabled={itemBusy}
                          style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 500, color: 'var(--c-blue)' }}>
                          ＋ デリバリーを追加
                        </button>
                      )}
                      {editable && dlvAdd.open && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
                          <select value={dlvAdd.delivery_id} onChange={e => setDlvAdd(f => ({ ...f, delivery_id: e.target.value }))} disabled={itemBusy}
                            style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'inherit', fontSize: '.72rem', background: '#fff', maxWidth: 170 }}>
                            <option value="">委託先を選択</option>
                            <DeliveryOptGroups opts={deliveriesOpt} serviceId={deal.service_id || null} />
                          </select>
                          <input value={dlvAdd.fee} onChange={e => setDlvAdd(f => ({ ...f, fee: e.target.value }))} placeholder="委託費" inputMode="numeric" disabled={itemBusy}
                            style={{ width: 96, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 9px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                          <button onClick={addAssignment} disabled={itemBusy || !dlvAdd.delivery_id} className="ui-btn ui-btn--primary" style={{ fontSize: '.72rem', padding: '7px 14px' }}>提示する</button>
                          <button onClick={() => setDlvAdd({ open: false, delivery_id: '', fee: '' })} disabled={itemBusy} className="ui-btn ui-btn--secondary" style={{ fontSize: '.72rem', padding: '7px 10px' }}>閉じる</button>
                        </div>
                      )}
                    </div>

                    {/* ② 計算式ブロック — 粗利・報酬は計算行のみ（入力欄は売上・委託費・その他原価だけ）。 */}
                    {showFormula && (
                      <div style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                        <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', marginBottom: 8 }}>金額</p>
                        {/* 受注額（売上）: 成約ダイアログで入力済・ここでは修正可（明細1件=インライン入力／複数=明細ブロックで行別入力） */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '.68rem', fontWeight: 500 }}>
                          <span style={{ color: 'var(--muted2)' }}>受注額（売上）</span>
                          {editable && items.length === 1 ? (
                            <input key={`${deal.id}:rev`} defaultValue={items[0].revenue ?? ''} inputMode="numeric" placeholder="未入力" disabled={itemBusy}
                              onBlur={e => { const v = e.target.value.trim(); if (v !== String(items[0].revenue ?? '')) patchItem(items[0].id, { revenue: v === '' ? null : Number(v.replace(/[,，\s]/g, '')) }) }}
                              style={{ width: 110, border: '1.5px solid var(--blue-bg)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right', background: 'var(--blue-bg2)' }} />
                          ) : (
                            <span className="tnum" style={{ fontFamily: 'Inter', color: revenue > 0 ? 'var(--txt)' : 'var(--muted)' }}>¥{revenue.toLocaleString()}</span>
                          )}
                        </div>
                        <Row label={`委託費（了承済${assigns.filter(a => (a.status ?? 'assigned') === 'accepted' || (a.status ?? 'assigned') === 'assigned').length}件）`} val={acceptedCost} minus />
                        {proposedSum > 0 && <Row label="（提示中・未確定）" val={proposedSum} minus quiet />}
                        {expense > 0
                          ? <Row label="経費（承認済）" val={expense} minus />
                          : <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '.68rem', fontWeight: 500 }}><span style={{ color: 'var(--muted2)' }}>− 経費</span><span style={{ fontSize: '.62rem', color: 'var(--muted)' }}>納品後に申請</span></div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '.68rem', fontWeight: 500 }}>
                          <span style={{ color: 'var(--muted2)' }}>− その他原価</span>
                          {editable ? (
                            <input key={`${deal.id}:oc`} defaultValue={deal.other_cost ?? ''} inputMode="numeric" placeholder="0" disabled={itemBusy}
                              onBlur={e => { const v = e.target.value.trim(); if (v !== String(deal.other_cost ?? '')) savePnl({ other_cost: v }) }}
                              style={{ width: 96, border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.72rem', textAlign: 'right' }} />
                          ) : (
                            <span className="tnum" style={{ fontFamily: 'Inter' }}>−¥{(deal.other_cost ?? 0).toLocaleString()}</span>
                          )}
                        </div>
                        <Row label={`MB粗利（税抜・${rewardSettled && ri.isRate ? '確定' : phase === 'settled' ? '確定' : '見込み'}）`} val={gross} strong />
                        {(ri.isRate || deal.amount > 0 || cont.isContinuous) && (
                          <Row label={ri.isRate
                              ? `パートナー報酬（${baseWord(ri.baseLabel)}の${ri.rate}%・${rewardSettled ? '確定' : '見込み'}）`
                              : cont.isContinuous ? 'パートナー報酬（継続・月次）' : 'パートナー報酬（固定）'}
                            val={rewardShown} minus />
                        )}
                        <Row label="手残り（報酬控除後）" val={gross - rewardShown} quiet />
                      </div>
                    )}

                    {/* ③ 明細（サービス構成）— 成約前に整える機構の残置（複数タスク/L3ガード）。率・粗利の per-item 入力は全廃。 */}
                    <div style={{ marginTop: 22, paddingTop: 14, borderTop: '0.5px solid var(--line)' }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', letterSpacing: '.06em', marginBottom: 6 }}>明細</p>
                      {items.length === 0 && <p style={{ fontSize: 12, color: 'var(--muted2)', padding: '4px 0' }}>明細はまだありません</p>}
                      {[...items].sort((a, b) => a.sort - b.sort).map(it => (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '0.5px solid var(--line)' }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.services?.name ?? it.service_id}</span>
                          {editable && items.length > 1 && (
                            <input key={`${deal.id}:${it.id}:rev`} defaultValue={it.revenue ?? ''} inputMode="numeric" placeholder="売上" disabled={itemBusy}
                              onBlur={e => { const v = e.target.value.trim(); if (v !== String(it.revenue ?? '')) patchItem(it.id, { revenue: v === '' ? null : Number(v.replace(/[,，\s]/g, '')) }) }}
                              style={{ width: 96, border: '0.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.7rem', textAlign: 'right' }} />
                          )}
                          <span className="tnum" style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.7rem', fontWeight: 500, minWidth: 58, textAlign: 'right', color: it.amount > 0 ? 'var(--txt)' : 'var(--muted)' }}>
                            {it.amount > 0 ? `¥${it.amount.toLocaleString()}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* 純化バッチ(A): 「デリバリー進行（プロジェクト管理）」「プロジェクト概要/スコープ」は撤去。
                        納品は上のデリバリー行の状態（提示中→了承済→納品済み）と経費で語る＝契約とお金の記録に純化。 */}
                  </div>
                )
              })()}
              </div>
            </div>
          </div>

          {/* ベンダー純化P1: 納品済み確認（ripple文法＝結果予告→確定）。createPortal＝fixed包含ブロック事故回避（CLAUDE.md恒久） */}
          {deliverConfirm && typeof document !== 'undefined' && createPortal(
            <>
              <div onClick={() => setDeliverConfirm(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
              <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 400, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
                <b style={{ fontSize: '.92rem', display: 'block', lineHeight: 1.5 }}>{deliverConfirm.name}を納品済みにしますか</b>
                <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 8, lineHeight: 1.7 }}>
                  デリバリーには「納品済み」と表示され、経費の申請ができるようになります・ボードのレーンは納品済みへ動きます・確認の記録が案件タイムラインに残ります
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
                  <button onClick={() => setDeliverConfirm(null)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.74rem', padding: '9px 16px' }}>キャンセル</button>
                  <button onClick={() => markDelivered(deliverConfirm.id)} disabled={deliverBusy} className="ui-btn ui-btn--primary" style={{ fontSize: '.74rem', padding: '9px 18px' }}>納品済みにする</button>
                </div>
              </div>
            </>,
            document.body
          )}
        </>
  )
}
