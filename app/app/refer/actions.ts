'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifySlackEvent } from '@/lib/slack'

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

export async function submitPartnerReferral(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const serviceId    = formData.get('serviceId') as string
  const menuId       = formData.get('menuId') as string
  const customerType = ((formData.get('customerType') as string) || 'individual') as 'individual' | 'corporate'
  const companyName  = (formData.get('companyName') as string) || ''
  const contactName  = (formData.get('contactName') as string) || ''
  const customerName = (formData.get('customerName') as string) || (customerType === 'corporate' ? companyName : '')
  const phone        = formData.get('phone') as string
  const customerEmail = ((formData.get('customerEmail') as string) || '').trim()
  const memo         = formData.get('memo') as string
  const channel      = (formData.get('channel') as string) || 'referral'
  // L3: 相談案件（サービス未定で起票）。service_id=null・明細ゼロ・is_consultation=true。
  const isConsultation = formData.get('isConsultation') === '1'

  if (!customerName) throw new Error('お客様情報は必須です')

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) throw new Error('Partner not found')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .single()

  // Reward snapshot
  const { data: menu } = await supabase
    .from('service_menus')
    .select('*')
    .eq('id', menuId)
    .single()

  // ⑧ cooperation→メニューcoop_*（固定=即額／料率=確定時にbase）、紹介→ref_*
  let amount = 0
  if (channel === 'cooperation') {
    amount = (menu?.coop_enabled && menu.coop_type === 'fixed') ? Number(menu.coop_value ?? 0) : 0
  } else {
    amount = menu?.ref_type === 'fixed' ? Number(menu.ref_value) : 0
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
      reward_snapshot: isConsultation ? null : (menu ?? null),
      internal_memo: [isConsultation && '【相談（サービス未定）】', phone && `TEL: ${phone}`, memo].filter(Boolean).join('\n') || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw error

  // L3: 相談マーカー（is_consultation 列が未追加(DDL前)でも作成を壊さない best-effort）。
  if (isConsultation) {
    const { error: cErr } = await supabase.from('deals').update({ is_consultation: true }).eq('id', deal!.id)
    if (cErr) { /* 列未追加 等は無視 */ }
  }

  // B-2: 顧客メールを保存（任意）。customer_email 列が未追加(DDL前)でも deal 作成を壊さないよう
  // 本体insertとは分離した best-effort update（列なし時はエラーを無視）。
  if (customerEmail) {
    const { error: emailErr } = await supabase.from('deals').update({ customer_email: customerEmail }).eq('id', deal!.id)
    if (emailErr) { /* 列未追加(DDL前) 等は無視 — 表示/通知のみ */ }
  }

  // L3: 相談案件は明細ゼロ・タスクなしで起票（面談後に運営が明細追加→そのとき service/タスクを割当）。
  if (!isConsultation) {
    // L1: 明細1行を同時生成（外見不変・内部のみ。deals.amount = SUM(deal_items.amount) を作成時点で満たす）。
    try {
      const { createServiceRoleClient } = await import('@/lib/supabase/server')
      const { createDealItem, dealItemKind } = await import('@/lib/deal-items')
      const admin = await createServiceRoleClient()
      await createDealItem(admin, {
        deal_id: deal!.id, service_id: serviceId, menu_id: menuId || null,
        kind: dealItemKind(channel, menu as { ref_type?: string; coop_type?: string } | null),
        amount, base_amount: null,
      })
    } catch { /* best-effort */ }

    // P: 協力dealはテンプレから対応タスクを実体化（best-effort・テーブル未作成なら no-op）。
    if (channel === 'cooperation') {
      try {
        const { createServiceRoleClient } = await import('@/lib/supabase/server')
        const { instantiateDealTasks } = await import('@/lib/coop-tasks')
        const admin = await createServiceRoleClient()
        await instantiateDealTasks(admin, { id: deal!.id, service_id: serviceId, menu_id: menuId || null, channel })
      } catch { /* best-effort */ }
    }
  }

  // Deal event
  await supabase.from('deal_events').insert({
    deal_id: deal!.id,
    body: `${profile?.name ?? 'パートナー'}が紹介を登録しました。顧客: ${customerName}`,
    visible_to_partner: true,
    created_by: user.id,
  })

  await notifySlackEvent('new_deal', `🆕 新規案件（${isConsultation ? '相談・サービス未定／' : ''}${channel === 'cooperation' ? '協力' : '紹介'}）: ${customerName}（登録: ${profile?.name ?? 'パートナー'}）`)

  // Batch B ①: 運営メール（Slackは既存のnew_dealゲート送信を流用・二重送信しない）。best-effort。
  try {
    const { sendOpsEmail } = await import('@/lib/notify')
    await sendOpsEmail(
      `【MB Partners】新規案件（${isConsultation ? '相談・サービス未定' : channel === 'cooperation' ? '協力' : '紹介'}）: ${customerName}`,
      `新規案件が登録されました。${isConsultation ? '\n・種別：相談（サービス未定）' : ''}\n・関わり方：${channel === 'cooperation' ? '協力' : '紹介'}\n・お客さま：${customerName}\n・登録：${profile?.name ?? 'パートナー'}`,
    )
  } catch { /* best-effort */ }

  // Audit log
  await supabase.from('audit_logs').insert({
    actor_profile_id: user.id,
    actor_name: profile?.name ?? 'パートナー',
    category: '案件',
    target: customerName,
    action: '紹介登録(フォーム)',
    meta: { service_id: serviceId, partner_id: partner.id, menu_id: menuId },
  })

  // C2④ パートナー本人へ受付確認メール（ベストエフォート）
  try {
    if (profile?.email) {
      const { data: svc } = await supabase.from('services').select('name').eq('id', serviceId).single()
      const { sendReceiptEmail } = await import('@/lib/email')
      const { customerHonorific } = await import('@/lib/customer')
      await sendReceiptEmail({
        to: profile.email,
        partnerName: profile.name,
        kind: channel === 'cooperation' ? 'cooperation' : 'referral',
        customerName: customerHonorific({ customer_type: customerType, company_name: companyName, contact_name: contactName, customer_name: customerName }),
        serviceName: svc?.name ?? null,
        menuName: (menu as { name?: string } | null)?.name ?? null,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/app')
  return { dealId: deal!.id }
}
