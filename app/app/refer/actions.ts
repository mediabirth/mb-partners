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
  const customerName = formData.get('customerName') as string
  const phone        = formData.get('phone') as string
  const memo         = formData.get('memo') as string
  const channel      = (formData.get('channel') as string) || 'referral'

  if (!customerName) throw new Error('お名前は必須です')

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
      service_id: serviceId,
      menu_id: menuId || null,
      customer_name: customerName,
      channel,
      source: 'partner_form',
      status: 'received',
      consent: true,
      amount,
      reward_snapshot: menu ?? null,
      internal_memo: [phone && `TEL: ${phone}`, memo].filter(Boolean).join('\n') || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw error

  // Deal event
  await supabase.from('deal_events').insert({
    deal_id: deal!.id,
    body: `${profile?.name ?? 'パートナー'}が紹介を登録しました。顧客: ${customerName}`,
    visible_to_partner: true,
    created_by: user.id,
  })

  await notifySlackEvent('new_deal', `🆕 新規案件（${channel === 'cooperation' ? '協力' : '紹介'}）: ${customerName}（登録: ${profile?.name ?? 'パートナー'}）`)

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
      await sendReceiptEmail({
        to: profile.email,
        partnerName: profile.name,
        kind: channel === 'cooperation' ? 'cooperation' : 'referral',
        customerName,
        serviceName: svc?.name ?? null,
        menuName: (menu as { name?: string } | null)?.name ?? null,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/app')
  return { dealId: deal!.id }
}
