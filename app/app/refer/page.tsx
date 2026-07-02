'use client'
import { Fragment, useEffect, useState, useTransition } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import ServiceAvatar from '@/components/ServiceAvatar'
import type { ServiceWithMenus, MenuRow, Menu, MenuReward } from '@/lib/supabase/queries'
import { rewardValueText, rewardPillText } from '@/lib/reward-format'
import { submitPartnerReferral, getPartnerInfo } from './actions'

// リファラル v3.1：世界観は「紹介」1つ。協力タスクで報酬が変わるだけ。「協力/関わり方」はUIに出さない。
// デザイン規律：塗りボタンは1画面1つ・見出し18px/500・本文14px・ラベル12px・注記11px・太さ400/500のみ・
//   罫線0.5px・アイコン/チェック16px・セクションは余白で区切る・絵文字なし。
type Step = 'select' | 'form' | 'consult'
type TaskDetail = { label: string; description: string | null }

const C = {
  line: '0.5px solid var(--line)',
  input: { width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: 14, fontWeight: 400 as const, background: '#fff', color: 'var(--txt)' },
  label: { fontSize: 12, fontWeight: 500 as const, color: 'var(--muted2)', display: 'block', marginBottom: 6 },
  note: { fontSize: 11, color: 'var(--muted2)', lineHeight: 1.6 },
}

function rewardLabelFromReward(r: MenuReward | null): string { return r ? rewardValueText(r) : '' }
function rewardPill(r: MenuReward): string { return rewardPillText(r) }
function confirmTrailing(r: MenuReward): string {
  return `${rewardLabelFromReward(r)} ・ 成約時、翌月末払い`
}

// STEP1 タイルの報酬レンジ最小表記（1色）。
function serviceRewardRange(svc: ServiceWithMenus): string {
  const rewards = svc.service_menus.flatMap(sm => (sm.menus ?? []).flatMap(m => m.rewards ?? []))
  if (rewards.length === 0) return ''
  const fixedVals = rewards.filter(r => r.reward_type === 'fixed').map(r => Number(r.reward_value || 0)).filter(v => v > 0)
  const hasVariable = rewards.some(r => r.reward_type === 'rate' || r.reward_type === 'continuous')
  if (fixedVals.length) {
    const min = Math.min(...fixedVals), max = Math.max(...fixedVals)
    if (hasVariable) return `報酬 ¥${min.toLocaleString()}〜`
    if (max > min)   return `報酬 ¥${min.toLocaleString()}〜¥${max.toLocaleString()}`
    return `報酬 ¥${min.toLocaleString()}`
  }
  if (hasVariable) return '報酬 成約額に応じて'
  return '報酬あり'
}

export default function ReferPage() {
  const router = useRouter()
  const { data: services = [], error: svcError, isLoading: svcLoading, mutate: refetchServices } =
    useSWR<ServiceWithMenus[]>('/api/services', { shouldRetryOnError: true, errorRetryCount: 10, errorRetryInterval: 1500 })
  const [step, setStep]                   = useState<Step>('select')
  const [expandedSvc, setExpandedSvc]     = useState<string | null>(null)   // グリッドで展開中のブランド
  const [selSvc, setSelSvc]               = useState<ServiceWithMenus | null>(null)
  const [selMenu, setSelMenu]             = useState<MenuRow | null>(null)
  const [coopMode, setCoopMode]           = useState(false)   // 内部のみ：reward_type由来のchannel判定。UIには出さない。
  const [introMethod, setIntroMethod]     = useState<'send' | 'self'>('send')  // アポ型：日時の決めかた
  const [customerType, setCustomerType]   = useState<'individual' | 'corporate'>('individual')
  const [customerName, setCustomerName]   = useState('')
  const [companyName, setCompanyName]     = useState('')
  const [contactName, setContactName]     = useState('')
  const [contactTitle, setContactTitle]   = useState('')
  const [phone, setPhone]                 = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [memo, setMemo]                   = useState('')
  const [consent, setConsent]             = useState(false)
  const [taskChecks, setTaskChecks]       = useState<string[]>([])   // 個別タスクのチェック済みラベル
  const [openInfo, setOpenInfo]           = useState<string | null>(null)   // ⓘポップオーバーが開いているタスク
  const [selMenuRef, setSelMenuRef]       = useState<string | null>(null)
  const [selMenuName, setSelMenuName]     = useState<string>('')
  const [selReward, setSelReward]         = useState<MenuReward | null>(null)
  const [consultNote, setConsultNote]     = useState('')
  const [pending, startTransition]        = useTransition()
  const [error, setError]                 = useState('')

  useEffect(() => { startTransition(async () => { try { await getPartnerInfo() } catch { /* silent */ } }) }, [])

  // SYNAPSE 引き継ぎ：クエリ（ct/co/nm/phone/memo）で入力欄の初期値だけ補完（送信・帰属・金額には非関与）。
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const ct = q.get('ct'); const co = q.get('co'); const nm = q.get('nm'); const ph = q.get('phone'); const mm = q.get('memo')
      if (ct === 'corporate' || ct === 'individual') setCustomerType(ct)
      if (co) setCompanyName(co)
      if (nm) { if (ct === 'corporate') setContactName(nm); else setCustomerName(nm) }
      if (ph) setPhone(ph)
      if (mm) setMemo(mm)
    } catch { /* noop */ }
  }, [])

  function toggleTile(svc: ServiceWithMenus) {
    setExpandedSvc(prev => prev === svc.id ? null : svc.id)
  }

  // メニュー行を選ぶ→登録ページ。channel は reward_type 由来（内部・表示なし）。
  function pickReward(serviceMenu: MenuRow, menu: Menu, reward: MenuReward) {
    setSelSvc(services.find(s => s.service_menus.some(sm => sm.id === serviceMenu.id)) ?? null)
    setSelMenu(serviceMenu)
    setSelMenuRef(menu.id)
    setSelMenuName(menu.name)
    setSelReward(reward)
    setCoopMode(reward.reward_type === 'rate' || reward.reward_type === 'continuous')
    setTaskChecks([]); setConsent(false); setIntroMethod('send'); setOpenInfo(null); setError('')
    setStep('form')
  }

  function applyCustomerFields(fd: FormData) {
    fd.set('customerType', customerType)
    if (customerType === 'corporate') {
      fd.set('companyName', companyName); fd.set('contactName', contactName); fd.set('contactTitle', contactTitle)
      fd.set('customerName', companyName)
    } else {
      fd.set('customerName', customerName)
    }
    fd.set('customerEmail', customerEmail.trim())
  }

  // v3.1 バリデーション：名前必須（全ケース）／電話・メールいずれか必須／全タスクチェック／了承チェック。
  //   deal作成の money/channel/タスク記録の仕組みは非接触（送信内容は従来どおり）。
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const nm = (customerType === 'corporate' ? companyName : customerName).trim()
    if (!nm) { setError('お名前を入力してください'); return }
    if (!phone.trim() && !customerEmail.trim()) { setError('電話番号かメールアドレスのどちらかをご入力ください'); return }
    if (!allTasksChecked) { setError('担当する内容をすべてご確認ください'); return }
    if (!consent) { setError('お客さまの了承の確認が必要です'); return }
    const fd = new FormData()
    fd.set('serviceId', selSvc!.id)
    fd.set('menuId', selMenu?.id ?? '')
    applyCustomerFields(fd)
    fd.set('phone', phone)
    fd.set('memo', memo)
    fd.set('channel', coopMode ? 'cooperation' : 'referral')
    if (selMenuRef) fd.set('menuRef', selMenuRef)
    if (selReward) fd.set('rewardRef', selReward.id)
    if (coopMode) fd.set('coverageAgreed', JSON.stringify({ labels: coverageTasks, at: new Date().toISOString() }))
    startTransition(async () => {
      try {
        const res = await submitPartnerReferral(fd)
        if (res?.dealId) router.push(`/app/cases/${res.dealId}?next=${introMethod}`)
        else setError('登録に失敗しました')
      } catch (err: any) { setError(err.message ?? '登録に失敗しました') }
    })
  }

  function handleConsultSubmit(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const nm = (customerType === 'corporate' ? companyName : customerName).trim()
    if (!nm) { setError('お名前を入力してください'); return }
    if (!phone.trim() && !customerEmail.trim()) { setError('電話番号かメールアドレスのどちらかをご入力ください'); return }
    if (!consent) { setError('お客さまの了承の確認が必要です'); return }
    const fd = new FormData()
    fd.set('serviceId', ''); fd.set('menuId', '')
    applyCustomerFields(fd)
    fd.set('phone', phone); fd.set('memo', consultNote)
    fd.set('channel', 'referral'); fd.set('isConsultation', '1')
    startTransition(async () => {
      try {
        const res = await submitPartnerReferral(fd)
        if (res?.dealId) router.push(`/app/cases/${res.dealId}`)
        else setError('起票に失敗しました')
      } catch (err: any) { setError(err.message ?? '起票に失敗しました') }
    })
  }

  // 担い：rate/continuous（=coopMode）はアポイント担当→「日時の決めかた」を出す。fixed は連絡のみ。
  const hasAppointment = coopMode
  // あなたが担うこと：cooperation_task_templates 由来（label＋description・データ）。連絡型は先頭タスクのみ表示。
  const allTaskDetails: TaskDetail[] = dedupeTasks((selMenu as { coverage_task_details?: TaskDetail[] } | null)?.coverage_task_details
    ?? ((selMenu as { coverage_tasks?: string[] } | null)?.coverage_tasks ?? []).map(l => ({ label: l, description: null })))
  const taskDetails = hasAppointment ? allTaskDetails : allTaskDetails.slice(0, 1)
  const coverageTasks = taskDetails.map(t => t.label)
  const allTasksChecked = coverageTasks.every(t => taskChecks.includes(t))
  const nameFilled = (customerType === 'corporate' ? companyName : customerName).trim().length > 0
  const contactFilled = phone.trim().length > 0 || customerEmail.trim().length > 0
  const canSubmit = nameFilled && contactFilled && allTasksChecked && consent && !pending

  return (
    <div>
      {/* ── 統合サービス選択（タイル＋直下展開パネル） ── */}
      {step === 'select' && (
        <div className="page-anim">
          <div style={{ padding: '22px 20px 14px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>どんな人を紹介しますか？</h2>
            <p style={{ ...C.note, marginTop: 6 }}>タップするとメニューが開きます。</p>
          </div>
          <div style={{ padding: '0 20px 28px' }}>
            {services.length === 0 && (svcLoading || svcError) && (
              <div style={{ background: '#fff', border: C.line, borderRadius: 14, padding: '26px 18px', marginBottom: 12, textAlign: 'center' }}>
                {svcError ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>サービスの読み込みに失敗しました</div>
                    <div style={{ ...C.note, marginBottom: 14 }}>通信状況をご確認のうえ、再読み込みしてください。</div>
                    <button onClick={() => refetchServices()} style={btnPrimary}>再読み込み</button>
                  </>
                ) : <div style={{ ...C.note }}>サービスを読み込んでいます…</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {chunk(services, 2).map((row, ri) => (
                <Fragment key={ri}>
                  {row.map(svc => (
                    <ServiceTile key={svc.id} svc={svc} active={expandedSvc === svc.id} onTap={() => toggleTile(svc)} />
                  ))}
                  {row.some(s => s.id === expandedSvc) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <MenuPanel svc={services.find(s => s.id === expandedSvc)!} onPick={pickReward} />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
            {/* 相談カード（全幅最下部） */}
            <button onClick={() => { setStep('consult'); setError('') }} style={{ width: '100%', marginTop: 12, background: 'var(--bg2)', border: '0.5px dashed var(--line)', borderRadius: 14, padding: '15px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>迷ったらまず相談</span>
                <span style={{ display: 'block', ...C.note, marginTop: 2 }}>MBが一緒に決めます。</span>
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 15, flexShrink: 0 }}>›</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 登録ページ v3.1 ── */}
      {step === 'form' && selSvc && (
        <div className="page-anim">
          <button onClick={() => setStep('select')} style={backBtn}>← 戻る</button>
          <div style={{ padding: '8px 20px 4px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{selSvc.name}{selMenuName ? ` ─ ${selMenuName}` : ''}</div>
            <h2 style={{ fontSize: 18, fontWeight: 500, marginTop: 5, letterSpacing: '-.01em' }}>お客さまを紹介する</h2>
            {selReward && <div style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6 }}>{confirmTrailing(selReward)}</div>}
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '18px 20px 32px' }}>
            {/* お客さまの情報 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>お客さまの情報</div>
              <div style={{ marginBottom: 14 }}>
                <Segment value={customerType} onChange={setCustomerType} options={[['individual', '個人'], ['corporate', '法人']]} />
              </div>
              {customerType === 'individual' ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={C.label}>お名前</label>
                  <input style={C.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" />
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 14 }}><label style={C.label}>会社名</label>
                    <input style={C.input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" /></div>
                  <div style={{ marginBottom: 14 }}><label style={C.label}>ご担当者名（任意）</label>
                    <input style={C.input} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" /></div>
                  <div style={{ marginBottom: 14 }}><label style={C.label}>部署・役職（任意）</label>
                    <input style={C.input} value={contactTitle} onChange={e => setContactTitle(e.target.value)} placeholder="例：営業部 部長" /></div>
                </>
              )}
              <div style={{ marginBottom: 12 }}><label style={C.label}>電話番号（任意）</label>
                <input style={C.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" inputMode="tel" /></div>
              <div style={{ marginBottom: 8 }}><label style={C.label}>メールアドレス（任意）</label>
                <input style={C.input} type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" /></div>
              <p style={C.note}>電話番号とメールアドレスのどちらか一方は必ずご入力ください。MBからのご連絡に使用します。</p>
              <div style={{ marginTop: 14 }}><label style={C.label}>メモ（任意）</label>
                <input style={C.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="7月に引越し希望 など" /></div>
            </div>

            {/* アポイントを担うメニュー：日時の決めかた。連絡のみ：info ボックス。 */}
            {hasAppointment ? (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>日時の決めかた</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Radio active={introMethod === 'send'} onSelect={() => setIntroMethod('send')}
                    title="お客さまに面談日時調整リンクを送る" desc="お客さまがカレンダーから日時を選べます。" />
                  <Radio active={introMethod === 'self'} onSelect={() => setIntroMethod('self')}
                    title="あなたが面談日時を予約する" desc="次の案件ページで、空き枠から予約できます。" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 24, background: 'var(--bg2)', borderRadius: 11, padding: '14px 15px' }}>
                <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>
                  ご紹介のあとは、MBからお客さまへご連絡します。あなたの作業はこのページで完了です。
                </p>
              </div>
            )}

            {/* あなたが担うこと：個別タスクチェック＋ⓘポップオーバー */}
            {taskDetails.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>あなたが担うこと</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {taskDetails.map(t => {
                    const on = taskChecks.includes(t.label)
                    return (
                      <div key={t.label} style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0' }}>
                          <input type="checkbox" checked={on} onChange={() => setTaskChecks(p => on ? p.filter(x => x !== t.label) : [...p, t.label])}
                            style={{ width: 16, height: 16, accentColor: 'var(--c-blue)', flexShrink: 0, cursor: 'pointer' }} />
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 400 }}>{t.label}</span>
                          {t.description && (
                            <button type="button" onClick={() => setOpenInfo(v => v === t.label ? null : t.label)} aria-label="説明"
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                              <InfoIcon />
                            </button>
                          )}
                        </div>
                        {openInfo === t.label && t.description && (
                          <>
                            <div onClick={() => setOpenInfo(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                            <div style={{ position: 'relative', zIndex: 21, background: '#fff', border: C.line, borderRadius: 10, boxShadow: '0 6px 24px rgba(14,14,20,.12)', padding: '11px 13px', margin: '0 0 8px 26px' }}>
                              <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{t.description}</p>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 同意（必須・全ケース） */}
            <label htmlFor="consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: 'var(--c-blue)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--txt)' }}>お客さまに、MBからご連絡することを了承いただいています</span>
            </label>

            {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
            <button type="submit" disabled={!canSubmit} style={{ ...btnPrimary, width: '100%', opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
              {pending ? '送信中…' : '紹介する'}
            </button>
            <p style={{ ...C.note, textAlign: 'center', marginTop: 10 }}>押すと案件ページに移動します。リンクの発行・送付はそこで行えます。</p>
          </form>
        </div>
      )}

      {/* ── 相談（サービス未定）起票 ── */}
      {step === 'consult' && (
        <div className="page-anim">
          <button onClick={() => setStep('select')} style={backBtn}>← 戻る</button>
          <div style={{ padding: '8px 20px 4px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>迷ったら相談</h2>
            <p style={{ ...C.note, marginTop: 6 }}>内容は面談で詰めます。サービス・報酬は後からMBが決めます。</p>
          </div>
          <form onSubmit={handleConsultSubmit} style={{ padding: '18px 20px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <Segment value={customerType} onChange={setCustomerType} options={[['individual', '個人'], ['corporate', '法人']]} />
            </div>
            {customerType === 'individual' ? (
              <div style={{ marginBottom: 14 }}><label style={C.label}>お名前</label>
                <input style={C.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" /></div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}><label style={C.label}>会社名</label>
                  <input style={C.input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" /></div>
                <div style={{ marginBottom: 14 }}><label style={C.label}>ご担当者名（任意）</label>
                  <input style={C.input} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" /></div>
              </>
            )}
            <div style={{ marginBottom: 14 }}><label style={C.label}>相談内容（何を迷っているか）</label>
              <textarea value={consultNote} onChange={e => setConsultNote(e.target.value)} rows={3} placeholder="例：集客と採用、どちらから着手すべきか迷っている 等" style={{ ...C.input, resize: 'vertical' }} /></div>
            <div style={{ marginBottom: 12 }}><label style={C.label}>電話番号（任意）</label>
              <input style={C.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" inputMode="tel" /></div>
            <div style={{ marginBottom: 8 }}><label style={C.label}>メールアドレス（任意）</label>
              <input style={C.input} type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" /></div>
            <p style={{ ...C.note, marginBottom: 16 }}>電話番号とメールアドレスのどちらか一方は必ずご入力ください。</p>
            <label htmlFor="cconsent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" id="cconsent" checked={consent} onChange={e => setConsent(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 1, accentColor: 'var(--c-blue)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--txt)' }}>お客さまに、MBからご連絡することを了承いただいています</span>
            </label>
            {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
            <button type="submit" disabled={pending} style={{ ...btnPrimary, width: '100%', opacity: pending ? 0.4 : 1 }}>
              {pending ? '送信中…' : '相談として起票する'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = { minHeight: 44, background: 'var(--c-blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '0 20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const backBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 400, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }

function chunk<T>(arr: T[], n: number): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
function dedupeTasks(list: TaskDetail[]): TaskDetail[] {
  const seen = new Set<string>(); const out: TaskDetail[] = []
  for (const t of list) { if (!seen.has(t.label)) { seen.add(t.label); out.push(t) } }
  return out
}

function InfoIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" strokeLinecap="round"/></svg>
}

// 個人/法人の小セグメント（高さ30px・13px）。
function Segment({ value, onChange, options }: { value: string; onChange: (v: any) => void; options: [string, string][] }) {
  return (
    <div style={{ display: 'inline-flex', border: '0.5px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([v, l], i) => (
        <button type="button" key={v} onClick={() => onChange(v)}
          style={{ height: 30, padding: '0 18px', fontSize: 13, fontWeight: value === v ? 500 : 400, fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderLeft: i ? '0.5px solid var(--line)' : 'none', background: value === v ? 'var(--c-blue)' : '#fff', color: value === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
      ))}
    </div>
  )
}

function Radio({ active, onSelect, title, desc }: { active: boolean; onSelect: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onSelect} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', borderRadius: 11, padding: '13px 14px', display: 'flex', gap: 11, alignItems: 'flex-start', border: `0.5px solid ${active ? 'var(--c-blue)' : 'var(--line)'}`, background: active ? 'var(--blue-bg2)' : '#fff' }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', marginTop: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${active ? 'var(--c-blue)' : 'var(--line)'}`, background: active ? 'var(--c-blue)' : '#fff' }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: active ? 'var(--blue-dk)' : 'var(--txt)' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted2)', marginTop: 3, lineHeight: 1.55 }}>{desc}</span>
      </span>
    </button>
  )
}

// STEP1 タイル：アイコン34px＋紹介対象13px/500（2行）＋報酬レンジ11px。展開時 2px accent。
function ServiceTile({ svc, active, onTap }: { svc: ServiceWithMenus; active: boolean; onTap: () => void }) {
  const audience = (svc as { target_audience?: string | null }).target_audience || svc.name
  const range = serviceRewardRange(svc)
  return (
    <button onClick={onTap} style={{ background: active ? 'var(--blue-bg2)' : '#fff', border: active ? '2px solid var(--c-blue)' : '0.5px solid var(--line)', borderRadius: 14, padding: active ? '13px 13px' : '14px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 108 }}>
      <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={34} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{audience}</div>
        {range && <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 4 }}>{range}</div>}
      </div>
    </button>
  )
}

// 展開パネル：<ブランド> のメニューを選ぶ ＋ メニュー行（名前14px＋short_desc12px＋報酬ピル＋chevron・0.5px罫線）。
function MenuPanel({ svc, onPick }: { svc: ServiceWithMenus; onPick: (sm: MenuRow, menu: Menu, reward: MenuReward) => void }) {
  const groups = svc.service_menus
    .flatMap(sm => (sm.menus ?? []).map(menu => ({ sm, menu })))
    .filter(({ menu }) => (menu.rewards ?? []).length > 0)
    .sort((a, b) => ((a.menu as { sort?: number }).sort ?? 0) - ((b.menu as { sort?: number }).sort ?? 0))
  return (
    <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginTop: 2 }}>
      <div style={{ fontSize: 12, color: 'var(--muted2)', marginBottom: 4 }}>{svc.name} のメニューを選ぶ</div>
      {groups.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted2)', padding: '10px 0', margin: 0 }}>メニューは準備中です。</p>
      ) : groups.map(({ sm, menu }, i) => {
        const reward = (menu.rewards ?? [])[0]
        const short = (menu as { short_description?: string | null }).short_description
        return (
          <button key={menu.id} onClick={() => onPick(sm, menu, reward)}
            style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', padding: '13px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{menu.name}</span>
              {short && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>{short}</span>}
              {reward && <span style={{ display: 'inline-block', fontSize: 11, color: 'var(--c-blue)', marginTop: 6 }}>{rewardPill(reward)}</span>}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 15, flexShrink: 0 }}>›</span>
          </button>
        )
      })}
    </div>
  )
}
