'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { notifySlackEvent } from '@/lib/slack'
import { freezeFeeSnapshot } from '@/lib/supplier-fee'
import { resolveEffectiveReward } from '@/lib/reward-override'
import { createDealItem, dealItemKind } from '@/lib/deal-items'
import { instantiateDealTasks, markAutoTaskDone } from '@/lib/coop-tasks'

export async function getPartnerInfo(): Promise<{ code: string; id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const { data } = await supabase.from('partners').select('id, code').eq('profile_id', user.id).single()
  if (!data) throw new Error('Partner not found')
  return { code: data.code, id: data.id }
}

export async function getOrCreateReferralToken(serviceId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) throw new Error('Partner not found')

  // Existing?
  const { data: existing } = await supabase
    .from('referral_links')
    .select('token')
    .eq('partner_id', partner.id)
    .eq('service_id', serviceId)
    .single()
  if (existing?.token) return existing.token

  // Create new short token
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  const token = Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').substring(0, 12)

  await supabase.from('referral_links').insert({
    partner_id: partner.id,
    service_id: serviceId,
    token,
  })
  return token
}

async function submitSinglePartnerReferral(formData: FormData) {
  const timingStartedAt = performance.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  const timingAuthDoneAt = performance.now()

  const serviceId    = formData.get('serviceId') as string
  const menuId       = formData.get('menuId') as string
  const customerType = ((formData.get('customerType') as string) || 'individual') as 'individual' | 'corporate'
  const companyName  = (formData.get('companyName') as string) || ''
  const contactName  = (formData.get('contactName') as string) || ''
  const contactTitle = (formData.get('contactTitle') as string) || '' // ②b 法人: 部署・役職（任意・additive）
  const customerName = (formData.get('customerName') as string) || (customerType === 'corporate' ? companyName : '')
  const phone        = formData.get('phone') as string
  const customerEmail = ((formData.get('customerEmail') as string) || '').trim()
  const memo         = formData.get('memo') as string
  const channel      = (formData.get('channel') as string) || 'referral'
  // ③ 対応範囲の項目別同意（協力時・任意・additive）。チェック済みラベル＋同意時刻のjsonb文字列。
  // ④報酬ゲート(deal_tasks/requiredTasksDone)・帰属(partner_id)・money とは無関係の証跡。
  const coverageAgreedRaw = (formData.get('coverageAgreed') as string) || ''
  // 段階4：選択された新メニュー(menus・1報酬)の id。新規 deal の deals.menu_ref に記録（additive）。
  // ★既存 menu_id(旧 service_menus 参照)・channel・money計算・reward_snapshot 凍結は不変。menu_ref を足すだけ。
  const menuRefRaw = (formData.get('menuRef') as string) || ''
  const rewardRefRaw = (formData.get('rewardRef') as string) || ''   // 申し込まれた報酬（menu_rewards）
  // L3: 相談案件（サービス未定で起票）。service_id=null・明細ゼロ・is_consultation=true。
  const isConsultation = formData.get('isConsultation') === '1'
  const referralGroupId = ((formData.get('referralGroupId') as string) || '').trim() || null
  const consultMetaRaw = ((formData.get('consultMeta') as string) || '').trim()
  let consultMeta: Record<string, unknown> | null = null
  if (isConsultation && consultMetaRaw) {
    try {
      const parsed = JSON.parse(consultMetaRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) consultMeta = parsed as Record<string, unknown>
    } catch { throw new Error('相談内容を確認してください') }
  }
  let coverageAgreed: Record<string, unknown> | null = null
  if (channel === 'cooperation' && coverageAgreedRaw) {
    try {
      const parsed = JSON.parse(coverageAgreedRaw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) coverageAgreed = parsed as Record<string, unknown>
    } catch { /* 後方互換: 不正JSONは保存しないが起票は成立 */ }
  }

  if (!customerName) throw new Error('お客さま情報は必須です')
  // v3.1/①：連絡先必須（相談起票を除く）。法人＝メール必須／個人＝電話orメールいずれか必須。client と二重で担保。
  if (!isConsultation) {
    if (customerType === 'corporate') {
      if (!customerEmail) throw new Error('メールアドレスを入力してください')
    } else if (!(phone ?? '').trim() && !customerEmail) throw new Error('電話番号かメールアドレスのいずれかを入力してください')
  }
  const timingValidateDoneAt = performance.now()

  // EXP-1: 本人確認後の独立読取を並列化。認証・RLS・取得値は従来と同一。
  const [partnerResult, profileResult, menuResult] = await Promise.all([
    supabase.from('partners').select('id').eq('profile_id', user.id).single(),
    supabase.from('profiles').select('name, email').eq('id', user.id).single(),
    supabase.from('service_menus').select('*').eq('id', menuId).single(),
  ])
  const partner = partnerResult.data
  if (!partner) throw new Error('Partner not found')
  const profile = profileResult.data
  const menu = menuResult.data
  const admin = await createServiceRoleClient()
  const timingResolveDoneAt = performance.now()

  // ⑧ cooperation→メニューcoop_*（固定=即額／料率=確定時にbase）、紹介→ref_*
  let amount = 0
  if (channel === 'cooperation') {
    amount = (menu?.coop_enabled && menu.coop_type === 'fixed') ? Number(menu.coop_value ?? 0) : 0
  } else {
    amount = menu?.ref_type === 'fixed' ? Number(menu.ref_value) : 0
  }

  // 新モデル：申し込まれた報酬（menu_rewards）があれば amount/reward_snapshot をその報酬から（計算式は不変＝固定即額/率は確定時）。
  // snapshot は rateInfo 互換のため reward_* と ref_* の両キーで焼く。
  let rewardSnapshot: Record<string, unknown> | null = menu ?? null
  let continuousMonths: number | null = null   // 継続案件の期間（メニューの default_months を凍結・案件ごと後で変更可）
  if (rewardRefRaw) {
    const { data: mr } = await supabase.from('menu_rewards').select('*').eq('id', rewardRefRaw).single()
    if (mr) {
      // P1 パートナー別報酬率: 有効値を解決して焼く（個別＞全メニュー＞正典・失敗時は正典値＝fail-safe）。
      // 仕様正典: docs/design/partner-reward-override-design.md §2-A。型・ベースは正典のまま＝値のみ差し替え。
      let effValue = Number(mr.reward_value || 0)
      let overrideApplied: { override_id: string; original_value: number } | null = null
      try {
        const eff = await resolveEffectiveReward(admin, { partnerId: partner.id, reward: { id: mr.id, menu_id: mr.menu_id, reward_type: mr.reward_type, reward_value: Number(mr.reward_value || 0) } })
        effValue = eff.value
        if (eff.overridden && eff.override_id) overrideApplied = { override_id: eff.override_id, original_value: eff.original_value }
      } catch { /* fail-safe: 正典値 */ }
      // fixed=即額／rate・continuous=確定時(または月次)に算出＝作成時 amount は 0。継続も 0（毎月は continuous_payouts）。
      amount = mr.reward_type === 'fixed' ? effValue : 0
      rewardSnapshot = {
        ...mr,
        reward_type: mr.reward_type, reward_value: effValue, reward_base: mr.reward_base, reward_trigger: mr.reward_trigger,
        ref_type: mr.reward_type, ref_value: effValue, ref_base: mr.reward_base,
        // 継続条件を凍結（メニュー側の率・期間が後で変わっても確定済月は不変）。
        months: mr.reward_type === 'continuous' ? (mr.default_months ?? null) : null,
        ...(overrideApplied ? { override_applied: overrideApplied } : {}),
      }
      if (mr.reward_type === 'continuous') continuousMonths = mr.default_months ?? null
    }
  }
  const timingRewardDoneAt = performance.now()
  // 協力報酬も紹介報酬と同じく起票時点で凍結する。既存snapshotキーは保持し、coop_*だけを加える。
  if (channel === 'cooperation') {
    rewardSnapshot = {
      ...(rewardSnapshot ?? {}),
      coop_enabled: menu?.coop_enabled ?? null,
      coop_type: menu?.coop_type ?? null,
      coop_value: menu?.coop_value ?? null,
      coop_base: menu?.coop_base ?? null,
    }
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      partner_id: partner.id,
      service_id: isConsultation ? null : serviceId,
      menu_id: isConsultation ? null : (menuId || null),
      customer_name: customerName,
      customer_type: customerType,
      company_name: customerType === 'corporate' ? (companyName || null) : null,
      contact_name: customerType === 'corporate' ? (contactName || null) : null,
      channel,
      source: 'partner_form',
      status: 'received',
      consent: true,
      amount: isConsultation ? 0 : amount,
      reward_snapshot: isConsultation ? null : rewardSnapshot,
      continuous_months: isConsultation ? null : continuousMonths,
      referral_group_id: referralGroupId,
      is_consultation: isConsultation,
      consult_meta: isConsultation ? consultMeta : null,
      customer_email: customerEmail || null,
      contact_title: customerType === 'corporate' ? (contactTitle || null) : null,
      reward_ref: rewardRefRaw || null,
      menu_ref: menuRefRaw || null,
      coverage_agreed: coverageAgreed,
      internal_memo: [isConsultation && '【相談（サービス未定）】', phone && `TEL: ${phone}`, memo].filter(Boolean).join('\n') || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw error
  const timingInsertDoneAt = performance.now()

  // L3: 相談案件は明細ゼロ・タスクなしで起票（面談後に運営が明細追加→そのとき service/タスクを割当）。
  if (!isConsultation) {
    // L1: 明細1行を同時生成（外見不変・内部のみ。deals.amount = SUM(deal_items.amount) を作成時点で満たす）。
    try {
      await createDealItem(admin, {
        deal_id: deal!.id, service_id: serviceId, menu_id: menuId || null,
        kind: dealItemKind(channel, menu as { ref_type?: string; coop_type?: string } | null),
        amount, base_amount: null,
      })
    } catch { /* best-effort */ }
  }
  const timingItemDoneAt = performance.now()

  // P0-a: 系統連動レートの条件凍結。reward_snapshot・deal_itemsと同じ同期コアから絶対に外さない。
  try {
    await freezeFeeSnapshot(admin, deal!.id, { partnerId: partner.id, serviceId: isConsultation ? null : serviceId })
  } catch { /* 従来どおり best-effort。ただし完了までは同期で待つ */ }

  const timingCoreDoneAt = performance.now()

  // EXP-1: 成立条件と金額凍結が完了した後だけ、失敗しても成立を覆さない副作用を応答後へ送る。
  // reward_snapshot / deal_items / freezeFeeSnapshot は上の同期コアに固定し、この after() へ移してはならない。
  after(async () => {
    const backgroundStartedAt = performance.now()
    try {
      const sideEffects = await Promise.all([
        // deal_events はパートナーRLSでINSERT不可。本人認証・自案件作成済みを確認した同じ経路からservice roleで記録する。
        admin.from('deal_events').insert({
          deal_id: deal!.id,
          body: `${profile?.name ?? 'パートナー'}が紹介を登録しました。顧客: ${customerName}`,
          visible_to_partner: true,
          created_by: user.id,
        }),
        supabase.from('audit_logs').insert({
          actor_profile_id: user.id,
          actor_name: profile?.name ?? 'パートナー',
          category: '案件',
          target: customerName,
          action: '紹介登録(フォーム)',
          meta: { service_id: serviceId, partner_id: partner.id, menu_id: menuId },
        }),
        notifySlackEvent('new_deal', `新規案件${isConsultation ? '（相談・サービス未定）' : ''}: ${customerName}（登録: ${profile?.name ?? 'パートナー'}）`),
        channel === 'cooperation' && !isConsultation
          ? instantiateDealTasks(admin, { id: deal!.id, service_id: serviceId, menu_id: menuId || null, menu_ref: menuRefRaw || null, reward_ref: rewardRefRaw || null, channel })
              .then(() => markAutoTaskDone(admin, deal!.id, 'referral')).then(() => undefined, () => undefined)
          : Promise.resolve(),
      ])
      if (process.env.EXP1_TIMING === '1') console.info('[EXP1_AFTER_RESULT]', JSON.stringify(sideEffects))
    } catch { /* best-effort: 起票の成立を覆さない */ }
    const notificationDoneAt = performance.now()

    const caseUrl = `https://mb-partners.app/app/cases/${deal!.id}`
    let menuName = (menu as { name?: string } | null)?.name ?? ''
    try {
      const [menuNameResult, serviceNameResult] = await Promise.all([
        menuRefRaw ? supabase.from('menus').select('name').eq('id', menuRefRaw).single() : Promise.resolve({ data: null }),
        isConsultation ? Promise.resolve({ data: null }) : supabase.from('services').select('name').eq('id', serviceId).single(),
      ])
      const resolvedMenu = menuNameResult.data as { name?: string } | null
      if (resolvedMenu?.name) menuName = resolvedMenu.name
      const svcName = (serviceNameResult.data as { name?: string } | null)?.name ?? ''
      const menuLine = [svcName, menuName].filter(Boolean).join(' ─ ') || '—'
      const [{ sendOpsEmail }, { resolveTemplate }, { sendReceiptEmail }, { customerHonorific }, { sendTemplatedEmail }] = await Promise.all([
        import('@/lib/notify'),
        import('@/lib/notify/template-resolve'),
        import('@/lib/email'),
        import('@/lib/customer'),
        import('@/lib/mail-send'),
      ])
      const vars = { customer: customerName, menu: menuLine, partner: profile?.name ?? 'パートナー', link: caseUrl }
      const opsFallback = `新規案件が登録されました。${isConsultation ? '\n・種別：相談（サービス未定）' : ''}\n・お客さま：${customerName}\n・メニュー：${menuLine}\n・登録：${profile?.name ?? 'パートナー'}\n・案件ページ：${caseUrl}`
      const opsBody = (await resolveTemplate('ops-new-deal', vars)) ?? opsFallback
      const customerLabel = customerHonorific({ customer_type: customerType, company_name: companyName, contact_name: contactName, customer_name: customerName }) || 'お客さま'
      const mailResults = await Promise.all([
        sendOpsEmail(`【MB Partners】新規案件: ${customerName}`, opsBody, undefined, { event: '紹介受付', meta: { deal_id: deal!.id } }),
        profile?.email ? sendReceiptEmail({
          to: profile.email, partnerName: profile.name, kind: 'referral', customerName: customerLabel,
          serviceName: svcName || null, menuName: menuName || null, caseUrl,
        }) : Promise.resolve({ sent: false }),
        customerEmail ? sendTemplatedEmail({
          key: 'customer-receipt', to: customerEmail, toRole: 'customer',
          vars: { customer: customerLabel, partner: profile?.name ?? '', service: menuLine !== '—' ? menuLine : '' },
          meta: { deal_id: deal!.id },
        }) : Promise.resolve({ sent: false }),
      ])
      if (process.env.EXP1_TIMING === '1') console.info('[EXP1_MAIL_RESULT]', JSON.stringify({ dealId: deal!.id, customerEmail, results: mailResults }))
    } catch { /* best-effort: メール失敗でも起票は成立済み */ }
    if (process.env.EXP1_TIMING === '1') {
      const backgroundDoneAt = performance.now()
      console.info('[EXP1_TIMING]', JSON.stringify({
        action: isConsultation ? 'consultation' : 'referral', mode: 'after',
        coreMs: Math.round(timingCoreDoneAt - timingStartedAt),
        notifyMs: Math.round(notificationDoneAt - backgroundStartedAt),
        mailMs: Math.round(backgroundDoneAt - notificationDoneAt),
        responseMs: Math.round(timingCoreDoneAt - timingStartedAt),
      }))
    }
  })

  if (process.env.EXP1_TIMING === '1') {
    console.info('[EXP1_TIMING]', JSON.stringify({
      action: isConsultation ? 'consultation' : 'referral',
      mode: 'core',
      coreMs: Math.round(timingCoreDoneAt - timingStartedAt),
      responseMs: Math.round(timingCoreDoneAt - timingStartedAt),
      stages: {
        auth: Math.round(timingAuthDoneAt - timingStartedAt),
        validate: Math.round(timingValidateDoneAt - timingAuthDoneAt),
        resolve: Math.round(timingResolveDoneAt - timingValidateDoneAt),
        reward: Math.round(timingRewardDoneAt - timingResolveDoneAt),
        insert: Math.round(timingInsertDoneAt - timingRewardDoneAt),
        items: Math.round(timingItemDoneAt - timingInsertDoneAt),
        freeze: Math.round(timingCoreDoneAt - timingItemDoneAt),
      },
    }))
  }

  revalidatePath('/app')
  return { dealId: deal!.id }
}

type ReferralSelection = {
  id?: string
  label?: string
  serviceId?: string
  menuId?: string
  menuRef?: string
  rewardRef?: string
  channel?: 'referral' | 'cooperation'
  isConsultation?: boolean
  coverageAgreed?: string
}

/**
 * REF-1: 顧客情報を一度だけ受け取り、既存の単件起票経路を選択順にN回実行する。
 * 各単件の報酬解決・snapshot・fee凍結・明細・通知は submitSinglePartnerReferral が唯一の経路。
 * 途中失敗時は既に成功した案件を戻さず、失敗選択だけを呼出側へ返す。
 */
export async function submitPartnerReferral(formData: FormData) {
  const raw = ((formData.get('selections') as string) || '').trim()
  let selections: ReferralSelection[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('not-array')
      selections = parsed
    } catch { throw new Error('選択内容を確認してください') }
  }

  // 旧UI・既存テストの単件payloadも同じ単件経路へ通す後方互換。
  if (selections.length === 0) {
    selections = [{
      serviceId: (formData.get('serviceId') as string) || '',
      menuId: (formData.get('menuId') as string) || '',
      menuRef: (formData.get('menuRef') as string) || '',
      rewardRef: (formData.get('rewardRef') as string) || '',
      channel: ((formData.get('channel') as string) || 'referral') as 'referral' | 'cooperation',
      isConsultation: formData.get('isConsultation') === '1',
      coverageAgreed: (formData.get('coverageAgreed') as string) || '',
      label: formData.get('isConsultation') === '1' ? 'まず相談' : '紹介',
    }]
  }
  if (selections.length > 20) throw new Error('一度に登録できるのは20件までです')

  const requestedGroupId = ((formData.get('referralGroupId') as string) || '').trim()
  const referralGroupId = requestedGroupId || (selections.length > 1 ? crypto.randomUUID() : '')
  const dealIds: string[] = []
  const failures: { id: string; label: string; error: string }[] = []

  for (const [index, selection] of selections.entries()) {
    const single = new FormData()
    for (const [key, value] of formData.entries()) {
      if (key !== 'selections' && key !== 'referralGroupId') single.append(key, value)
    }
    single.set('serviceId', selection.serviceId || '')
    single.set('menuId', selection.menuId || '')
    single.set('menuRef', selection.menuRef || '')
    single.set('rewardRef', selection.rewardRef || '')
    single.set('channel', selection.channel || 'referral')
    single.set('isConsultation', selection.isConsultation ? '1' : '0')
    single.set('coverageAgreed', selection.coverageAgreed || '')
    if (referralGroupId) single.set('referralGroupId', referralGroupId)
    try {
      const result = await submitSinglePartnerReferral(single)
      dealIds.push(result.dealId)
    } catch (error) {
      failures.push({
        id: selection.id || `selection-${index + 1}`,
        label: selection.label || (selection.isConsultation ? 'まず相談' : `紹介${index + 1}`),
        error: error instanceof Error ? error.message : '登録に失敗しました',
      })
    }
  }

  revalidatePath('/app')
  return {
    dealId: dealIds[0] ?? null,
    dealIds,
    referralGroupId: referralGroupId || null,
    requested: selections.length,
    registered: dealIds.length,
    failures,
  }
}
