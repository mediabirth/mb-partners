'use client'
import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import ServiceAvatar from '@/components/ServiceAvatar'
import type { ServiceWithMenus, MenuRow, Menu, MenuReward } from '@/lib/supabase/queries'
import { rewardValueText, rewardPillText, rewardRangeLabel } from '@/lib/reward-format'
import { resolveMenuCoopTasks, type CoopTaskItem } from '@/lib/coop-task-display'
import RewardPill from '@/components/ui/RewardPill'
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

// v3 検索の正規化：NFKC（全角/半角統一）＋小文字＋空白除去。表示層の絞り込みのみ・データ非接触。
function norm(s: string | null | undefined): string {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
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
  const [selMenuData, setSelMenuData]     = useState<Menu | null>(null)
  const [selReward, setSelReward]         = useState<MenuReward | null>(null)
  const [showSheet, setShowSheet]         = useState(false)
  const [query, setQuery]                 = useState('')                 // v3：検索（クライアント絞り込み）
  const [category, setCategory]           = useState<string>('すべて')   // v3：カテゴリチップ（単一選択）
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
    setSelMenuData(menu)
    setSelReward(reward)
    setShowSheet(false)
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
    // ① 法人＝メール必須／個人＝電話orメールいずれか必須。
    if (customerType === 'corporate') {
      if (!customerEmail.trim()) { setError('メールアドレスをご入力ください'); return }
    } else if (!phone.trim() && !customerEmail.trim()) { setError('電話番号かメールアドレスのどちらかをご入力ください'); return }
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
  // ★協力タスクは一覧ピルと完全同一の解決経路（resolveMenuCoopTasks）＝共通純関数から出す（構造的整合保証）。
  const taskDetails: CoopTaskItem[] = resolveMenuCoopTasks((selMenu as { coverage_task_details?: CoopTaskItem[] } | null)?.coverage_task_details, selReward?.reward_type)
  const coverageTasks = taskDetails.map(t => t.label)
  const allTasksChecked = coverageTasks.every(t => taskChecks.includes(t))
  const nameFilled = (customerType === 'corporate' ? companyName : customerName).trim().length > 0
  // ① 法人＝メール必須／個人＝電話orメールいずれか必須。
  const contactFilled = customerType === 'corporate'
    ? customerEmail.trim().length > 0
    : (phone.trim().length > 0 || customerEmail.trim().length > 0)
  const canSubmit = nameFilled && contactFilled && allTasksChecked && consent && !pending

  // v3 スケール層：カテゴリ（services.sort 初出順のユニーク値）＋ 検索×チップ AND 絞り込み（クライアントのみ・API非追加）。
  const categories = ['すべて', ...services.reduce<string[]>((acc, s) => {
    const c = (s.category || '').trim()
    if (c && !acc.includes(c)) acc.push(c)
    return acc
  }, [])]
  const q = norm(query)
  const filteredServices = services.filter(svc => {
    const cat = (svc.category || '').trim()
    if (category !== 'すべて' && cat !== category) return false
    if (!q) return true
    const hay = norm([
      svc.name,
      (svc as { target_audience?: string | null }).target_audience || '',
      ...svc.service_menus.flatMap(sm => (sm.menus ?? []).map(m => m.name)),
    ].join(' '))
    return hay.includes(q)
  })

  // ④a 検索がメニュー名にヒット→該当ブランドを自動展開（検索解除で閉じる）。排他は expandedSvc 単一値で担保。
  useEffect(() => {
    const qq = norm(query)
    if (!qq) { setExpandedSvc(null); return }
    const hit = filteredServices.find(svc =>
      svc.service_menus.some(sm => (sm.menus ?? []).some(m => norm(m.name).includes(qq))))
    if (hit) setExpandedSvc(hit.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // ④c チップ行の横スクロール可否（右端フェードの表示判定）。
  const chipRowRef = useRef<HTMLDivElement>(null)
  const [chipsOverflow, setChipsOverflow] = useState(false)
  useEffect(() => {
    const el = chipRowRef.current
    if (!el) return
    const check = () => setChipsOverflow(el.scrollWidth > el.clientWidth + 2)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [categories.length])

  return (
    <div>
      {/* ── Opportunity Board：フル幅ブランドカード＋直下メニュー展開 ── */}
      {step === 'select' && (
        <div className="page-anim">
          <div style={{ padding: '22px 20px 12px' }}>
            {/* ② 見出しは「紹介をはじめる」18px/500 の1本（旧 eyebrow＋H1 の2行は廃止） */}
            <h2 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>紹介をはじめる</h2>
            {/* 検索フィールド（クライアント絞り込み・API非追加） */}
            <div style={{ position: 'relative', marginTop: 12 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', display: 'flex', pointerEvents: 'none' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" strokeLinecap="round" /></svg>
              </span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ブランド・メニューを探す" inputMode="search"
                style={{ width: '100%', height: 36, border: '0.5px solid var(--line)', borderRadius: 10, padding: '0 12px 0 34px', fontFamily: 'inherit', fontSize: 13, fontWeight: 400, background: '#fff', color: 'var(--txt)' }} />
            </div>
          </div>
          {/* カテゴリチップ行（横スクロール・単一選択・選択中＝黒系塗り＝v2.1規律・右端フェード④c） */}
          {categories.length > 1 && (
            <div style={{ position: 'relative' }}>
              <div ref={chipRowRef} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 20px 12px', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {categories.map(cat => {
                  const on = category === cat
                  return (
                    <button key={cat} onClick={() => setCategory(cat)} className="no-break"
                      style={{ flexShrink: 0, fontFamily: 'inherit', fontSize: 12, fontWeight: on ? 500 : 400, cursor: 'pointer', borderRadius: 999, padding: '5px 13px', whiteSpace: 'nowrap', border: on ? '0.5px solid var(--txt)' : '0.5px solid var(--line)', background: on ? 'var(--txt)' : '#fff', color: on ? '#fff' : 'var(--muted2)' }}>{cat}</button>
                  )
                })}
              </div>
              {chipsOverflow && (
                <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, bottom: 12, width: 24, pointerEvents: 'none', background: 'linear-gradient(90deg, rgba(247,247,250,0), var(--bg2))' }} />
              )}
            </div>
          )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredServices.map((svc, i) => (
                <BrandCard key={svc.id} svc={svc} active={expandedSvc === svc.id} index={i} onToggle={() => toggleTile(svc)} onPick={pickReward} />
              ))}
            </div>
            {services.length > 0 && filteredServices.length === 0 && (
              <div style={{ padding: '30px 8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>該当するメニューがありません</div>
                <p style={{ fontSize: 12, color: 'var(--muted2)', marginTop: 6, lineHeight: 1.6 }}>検索語やカテゴリを変えてみてください。<br />お探しのものが見つからないときは、下の相談からどうぞ。</p>
              </div>
            )}
            {/* ③ 相談カード＝一等市民（ブランドカードと同一解剖学：0.5px実線・radius14・40px bg-accentタイル） */}
            <button onClick={() => { setStep('consult'); setError('') }} style={{ width: '100%', marginTop: 12, background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'var(--blue-bg2)', color: 'var(--c-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>まず相談</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted2)', marginTop: 2, lineHeight: 1.5 }}>どのメニューか決まっていない・迷っている人はこちら。MBが一緒に考えます</span>
              </span>
              <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── 登録ページ v3.1 ── */}
      {step === 'form' && selSvc && (
        <div className="page-anim">
          <button onClick={() => setStep('select')} style={backBtn}>← メニュー選択に戻る</button>
          <div style={{ padding: '8px 20px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <ServiceAvatar logoPath={selSvc.logo_path} icon={selSvc.icon} color={selSvc.color} name={selSvc.name} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--muted2)' }}>{selSvc.name}</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 2 }}>
                  <h2 style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>{selMenuName}</h2>
                  {selReward && <MenuRowPill reward={selReward} />}
                  <button type="button" onClick={() => setShowSheet(true)} aria-label="メニューの詳細"
                    style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: '0.5px solid var(--line-2)', background: '#fff', color: 'var(--muted2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '18px 20px 32px' }}>
            {/* お客さまの情報 */}
            <div style={{ marginBottom: 28 }}>
              <div style={sectionTitle}>お客さまの情報</div>
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
              <div style={{ marginBottom: 14 }}><label style={C.label}>電話番号{customerType === 'corporate' ? '（任意）' : '（どちらか必須）'}</label>
                <input style={C.input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="09012345678" inputMode="tel" /></div>
              <div style={{ marginBottom: 14 }}><label style={C.label}>メールアドレス{customerType === 'corporate' ? '（必須）' : '（どちらか必須）'}</label>
                <input style={C.input} type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" autoComplete="off" /></div>
              <div><label style={C.label}>メモ（任意）</label>
                <input style={C.input} value={memo} onChange={e => setMemo(e.target.value)} placeholder="7月に引越し希望 など" /></div>
            </div>

            {/* アポ型：日時の決めかた。連絡のみ：1行 info（アイコン＋11px）。 */}
            {hasAppointment ? (
              <div style={{ marginBottom: 28 }}>
                <div style={sectionTitle}>日時の決めかた</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Radio active={introMethod === 'send'} onSelect={() => setIntroMethod('send')}
                    title="お客さまに面談日時調整リンクを送る" desc="お客さまがカレンダーから日時を選べます。" />
                  <Radio active={introMethod === 'self'} onSelect={() => setIntroMethod('self')}
                    title="あなたが面談日時を予約する" desc="次の案件ページで、空き枠から予約できます。" />
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 28, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 1, display: 'flex' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                </span>
                <p style={{ fontSize: 11, color: 'var(--muted2)', lineHeight: 1.6, margin: 0 }}>ご紹介のあとは、MBからお客さまへご連絡します。</p>
              </div>
            )}

            {/* あなたが担うこと：グループカード（0.5px枠・checkbox行・罫線区切り）。★本人が操作＝checkbox の形を維持。 */}
            {taskDetails.length > 0 && (
              <div style={{ marginBottom: 28, border: C.line, borderRadius: 12, padding: '4px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, padding: '13px 0 5px' }}>協力タスク</div>
                {taskDetails.map((t, i) => {
                  const on = taskChecks.includes(t.label)
                  return (
                    <div key={t.label} style={{ position: 'relative' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: i === 0 ? 'none' : C.line, cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => setTaskChecks(p => on ? p.filter(x => x !== t.label) : [...p, t.label])}
                          style={{ width: 16, height: 16, accentColor: 'var(--c-blue)', flexShrink: 0, cursor: 'pointer' }} />
                        <span style={{ fontSize: 14, fontWeight: 400 }}>{t.label}</span>
                        {t.description && (
                          <button type="button" onClick={e => { e.preventDefault(); setOpenInfo(v => v === t.label ? null : t.label) }} aria-label="説明"
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
                          </button>
                        )}
                      </label>
                      {openInfo === t.label && t.description && (
                        <>
                          <div onClick={() => setOpenInfo(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                          <div className="pop-in" style={{ position: 'relative', zIndex: 21, background: '#fff', border: C.line, borderRadius: 10, boxShadow: '0 6px 24px rgba(14,14,20,.12)', padding: '10px 12px', margin: '0 0 10px 26px' }}>
                            <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{t.description}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 送信ゾーン：了承（担うことカードの外・区切り線の後）＋CTA。無効CTAはグレー。 */}
            <div style={{ borderTop: C.line, paddingTop: 18 }}>
              <label htmlFor="consent" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" id="consent" checked={consent} onChange={e => setConsent(e.target.checked)}
                  style={{ width: 16, height: 16, marginTop: 1, accentColor: 'var(--c-blue)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--txt)' }}>お客さまに、MBからご連絡することを了承いただいています</span>
              </label>
              {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
              <button type="submit" disabled={!canSubmit}
                style={{ ...btnPrimary, width: '100%', background: canSubmit ? 'var(--c-blue)' : '#E7E7ED', color: canSubmit ? '#fff' : 'var(--muted)', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
                {pending ? '送信中…' : '紹介する'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── 相談（サービス未定）起票 ── */}
      {step === 'consult' && (
        <div className="page-anim">
          <button onClick={() => setStep('select')} style={backBtn}>← 戻る</button>
          {/* ⑤ 相談ページヘッダ再設計：40px bg-accentタイル＋「まず相談」18/500＋説明12/secondary/1.7 */}
          <div style={{ padding: '8px 20px 4px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'var(--blue-bg2)', color: 'var(--c-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>まず相談</h2>
              <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.7, marginTop: 6 }}>メニューが決まっていなくて大丈夫です。お客さまの状況を伺って、MBが最適なご提案を一緒に考えます。</p>
            </div>
          </div>
          <form onSubmit={handleConsultSubmit} style={{ padding: '18px 20px 32px' }}>
            <div style={{ marginBottom: 14 }}>
              <Segment value={customerType} onChange={setCustomerType} options={[['individual', '個人'], ['corporate', '法人']]} />
            </div>
            {customerType === 'individual' ? (
              <div style={{ marginBottom: 14 }}><label style={C.label}>お名前（必須）</label>
                <input style={C.input} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="山田 太郎" /></div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}><label style={C.label}>会社名（必須）</label>
                  <input style={C.input} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="株式会社〇〇" /></div>
                <div style={{ marginBottom: 14 }}><label style={C.label}>ご担当者名（任意）</label>
                  <input style={C.input} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="山田 太郎" /></div>
              </>
            )}
            <div style={{ marginBottom: 14 }}><label style={C.label}>相談したいこと（何を迷っているか）</label>
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
            <button type="submit" disabled={pending || !nameFilled} style={{ ...btnPrimary, width: '100%', opacity: (pending || !nameFilled) ? 0.4 : 1 }}>
              {pending ? '送信中…' : '相談する'}
            </button>
          </form>
        </div>
      )}

      {showSheet && selSvc && (
        <MenuDetailSheet
          svc={selSvc}
          menuName={selMenuName}
          menuDescription={selMenuData?.description ?? null}
          reward={selReward}
          tasks={resolveMenuCoopTasks((selMenu as { coverage_task_details?: CoopTaskItem[] } | null)?.coverage_task_details, selReward?.reward_type)}
          onClose={() => setShowSheet(false)}
        />
      )}
    </div>
  )
}

const btnPrimary: React.CSSProperties = { minHeight: 44, background: 'var(--c-blue)', color: '#fff', border: 'none', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', padding: '0 20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const backBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 400, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 500, marginBottom: 12 }

function chunk<T>(arr: T[], n: number): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
function dedupeTasks(list: TaskDetail[]): TaskDetail[] {
  const seen = new Set<string>(); const out: TaskDetail[] = []
  for (const t of list) { if (!seen.has(t.label)) { seen.add(t.label); out.push(t) } }
  return out
}

function InfoIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01" strokeLinecap="round"/></svg>
}

// 個人/法人の小セグメント（高さ30px・13px）。選択中＝neutral塗り（紫禁止）。
function Segment({ value, onChange, options }: { value: string; onChange: (v: any) => void; options: [string, string][] }) {
  return (
    <div style={{ display: 'inline-flex', border: '0.5px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {options.map(([v, l], i) => (
        <button type="button" key={v} onClick={() => onChange(v)}
          style={{ height: 30, padding: '0 18px', fontSize: 13, fontWeight: value === v ? 500 : 400, fontFamily: 'inherit', cursor: 'pointer', border: 'none', borderLeft: i ? '0.5px solid var(--line)' : 'none', background: value === v ? 'var(--txt)' : '#fff', color: value === v ? '#fff' : 'var(--muted2)' }}>{l}</button>
      ))}
    </div>
  )
}

// ラジオカード：選択中＝1.5px accent枠のみ（薄紫の面bg禁止）・ドットはaccent。
function Radio({ active, onSelect, title, desc }: { active: boolean; onSelect: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onSelect} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', borderRadius: 11, padding: '13px 14px', display: 'flex', gap: 11, alignItems: 'flex-start', border: active ? '1.5px solid var(--c-blue)' : '0.5px solid var(--line)', background: '#fff' }}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', marginTop: 2, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${active ? 'var(--c-blue)' : 'var(--line)'}`, background: active ? 'var(--c-blue)' : '#fff' }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted2)', marginTop: 3, lineHeight: 1.55 }}>{desc}</span>
      </span>
    </button>
  )
}

// Opportunity Board ブランドカード：フル幅・1行目(ロゴ40px+名前+メニューN+chevron)/2行目(フック文)/3行目(レンジピル+ヒント)。
//   展開でカード内にメニュー行リスト（0.5px罫線）。展開機構は既存の expandedSvc を維持（URL不変）。
function BrandCard({ svc, active, index, onToggle, onPick }: {
  svc: ServiceWithMenus; active: boolean; index: number
  onToggle: () => void; onPick: (sm: MenuRow, menu: Menu, reward: MenuReward) => void
}) {
  const audience = (svc as { target_audience?: string | null }).target_audience || ''
  const groups = svc.service_menus
    .flatMap(sm => (sm.menus ?? []).map(menu => ({ sm, menu })))
    .filter(({ menu }) => (menu.rewards ?? []).length > 0)
    .sort((a, b) => ((a.menu as { sort?: number }).sort ?? 0) - ((b.menu as { sort?: number }).sort ?? 0))
  // ④b 展開時に選択カードを視界へ（150msスムーズ・reduced-motion無効）。
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [active])
  return (
    <div ref={cardRef} className="ob-card" style={{ background: '#fff', border: active ? '1.5px solid var(--c-blue)' : '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden', animationDelay: `${index * 60}ms` }}>
      <button onClick={onToggle} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--txt)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* ① 1行目：ロゴ ＋ ブランド名(flex:1) ＋ chevron のみ（報酬レンジピルは撤去＝価格はメニュー行の報酬ピルだけ） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={40} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.name}</div>
          <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex', transition: 'transform 150ms ease-out', transform: active ? 'rotate(180deg)' : 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </div>
        {/* フック文（target_audience そのまま・折返し・truncateしない） */}
        {audience && <p style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.6, margin: 0 }}>{audience}</p>}
      </button>
      {/* 展開：メニュー行（1行目=名前+報酬ピル+chevron／2行目=協力タスクピル） */}
      {active && (
        <div className="exp-in" style={{ borderTop: '0.5px solid var(--line)', padding: '0 16px' }}>
          {groups.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted2)', padding: '13px 0', margin: 0 }}>メニューは準備中です。</p>
          ) : groups.map(({ sm, menu }, i) => {
            const reward = (menu.rewards ?? [])[0]
            // ★一覧のタスクピル＝登録ページのチェック項目 と同一の解決経路（共通純関数）。
            const tasks = resolveMenuCoopTasks((sm as { coverage_task_details?: CoopTaskItem[] }).coverage_task_details, reward?.reward_type)
            return (
              <button key={menu.id} onClick={() => onPick(sm, menu, reward)}
                style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'none', border: 'none', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)', padding: '13px 0', display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--txt)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{menu.name}</span>
                  {reward && <MenuRowPill reward={reward} />}
                  <span style={{ color: 'var(--muted)', flexShrink: 0, display: 'flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6l6 6-6 6" /></svg>
                  </span>
                </span>
                {tasks.length > 0 && (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {tasks.map(t => (
                      <span key={t.label} className="no-break" style={{ fontSize: 11, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{t.label}</span>
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// メニュー行の報酬ピル（共通 RewardPill・継続は「粗利X%」500＋「/月」400）。
function MenuRowPill({ reward }: { reward: MenuReward }) {
  if (reward.reward_type === 'continuous') {
    return <RewardPill style={{ flexShrink: 0 }}><span style={{ fontWeight: 500 }}>粗利の{Number(reward.reward_value)}%</span><span style={{ fontWeight: 400 }}>/月</span></RewardPill>
  }
  return <RewardPill style={{ flexShrink: 0 }}>{rewardLabelFromReward(reward)}</RewardPill>
}

// メニュー詳細シート（下からスライドイン・overlayタップ/ハンドル/閉じるボタンで閉じる・reduced-motion対応）。
//   節は該当データがnullなら非表示（名前・報酬・協力タスクは常に表示）。塗りボタン禁止（閉じる=0.5px枠）。
function MenuDetailSheet({ svc, menuName, menuDescription, reward, tasks, onClose }: {
  svc: ServiceWithMenus; menuName: string; menuDescription: string | null
  reward: MenuReward | null; tasks: CoopTaskItem[]; onClose: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const dur = reduced ? 0 : 220
  function close() {
    if (reduced) { onClose(); return }
    setOpen(false)
    setTimeout(onClose, dur)
  }
  const imageUrl = (svc as { image_url?: string | null }).image_url || null
  const svcDesc = svc.description || null
  const trigger = reward?.reward_trigger || null
  const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.06em', marginBottom: 6 }
  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.34)', opacity: open ? 1 : 0, transition: `opacity ${dur}ms ease-out`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: '10px 20px 28px', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: `transform ${dur}ms ease-out` }}>
        {/* 1. ハンドル */}
        <button type="button" onClick={close} aria-label="閉じる" style={{ display: 'block', width: 38, height: 4, borderRadius: 999, background: 'var(--line)', border: 'none', margin: '2px auto 16px', cursor: 'pointer', padding: 0 }} />
        {/* 2. ヒーロー：image_url／未設定はロゴタイル56pxのフォールバック（全ブランドが視覚アンカーを持つ） */}
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 12, marginBottom: 16, display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: 140, borderRadius: 12, marginBottom: 16, background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={56} />
          </div>
        )}
        {/* 3. メニュー名＋報酬ピル */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, letterSpacing: '-.01em' }}>{menuName}</h3>
          {reward && <MenuRowPill reward={reward} />}
        </div>
        {/* 4. 「{reward_trigger}に確定」右寄せ（選択中報酬のトリガー・空なら非表示） */}
        {trigger && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted2)', marginTop: 4 }}>{trigger}に確定</div>
        )}
        {/* 5. 「{service}とは」＋サービス説明 */}
        {svcDesc && (
          <div style={{ marginTop: 20 }}>
            <div style={headStyle}>{svc.name}とは</div>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)' }}>{svcDesc}</p>
          </div>
        )}
        {/* 6. 「このメニューでは」＋メニュー説明 */}
        {menuDescription && (
          <div style={{ marginTop: 20 }}>
            <div style={headStyle}>このメニューでは</div>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)' }}>{menuDescription}</p>
          </div>
        )}
        {/* 7. あなたの協力タスク */}
        {tasks.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={headStyle}>あなたの協力タスク</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tasks.map(t => (
                <span key={t.label} className="no-break" style={{ fontSize: 11, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{t.label}</span>
              ))}
            </div>
          </div>
        )}
        {/* 8. 閉じる（塗りボタン禁止・0.5px枠） */}
        <button type="button" onClick={close}
          style={{ width: '100%', minHeight: 44, marginTop: 24, background: '#fff', color: 'var(--txt)', border: '0.5px solid var(--line)', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          閉じる
        </button>
      </div>
    </div>
  )
}
