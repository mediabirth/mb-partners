import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { notifySlack } from '@/lib/slack'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, customerName, phone, memo, via } = body

    if (!token || !customerName) {
      return NextResponse.json({ error: 'token and customerName are required' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // Lookup referral link
    const { data: link, error: linkErr } = await supabase
      .from('referral_links')
      .select('id, partner_id, service_id')
      .eq('token', token)
      .single()

    if (linkErr || !link) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
    }

    // Get first active menu for the service (reward_snapshot)
    const { data: menus } = await supabase
      .from('service_menus')
      .select('*')
      .eq('service_id', link.service_id)
      .order('sort')
      .limit(1)

    const menu = menus?.[0] ?? null
    const amount = menu?.ref_type === 'fixed' ? Number(menu.ref_value) : 0
    const source = via === 'qr' ? 'qr' : 'link'

    // Create deal
    const { data: deal, error: dealErr } = await supabase
      .from('deals')
      .insert({
        partner_id: link.partner_id,
        service_id: link.service_id,
        menu_id: menu?.id ?? null,
        customer_name: customerName,
        channel: 'referral',
        source,
        status: 'received',
        consent: true,
        amount,
        reward_snapshot: menu ?? null,
        internal_memo: [phone && `TEL: ${phone}`, memo].filter(Boolean).join('\n') || null,
        created_by: null, // system
      })
      .select('id')
      .single()

    if (dealErr || !deal) {
      console.error('deal insert error', dealErr)
      return NextResponse.json({ error: 'Failed to create deal' }, { status: 500 })
    }

    // Get partner profile for notifications
    const { data: partner } = await supabase
      .from('partners')
      .select('profile_id, code')
      .eq('id', link.partner_id)
      .single()

    const { data: service } = await supabase
      .from('services')
      .select('name')
      .eq('id', link.service_id)
      .single()

    // Deal event
    await supabase.from('deal_events').insert({
      deal_id: deal.id,
      body: `${source === 'qr' ? 'QRコード' : '紹介リンク'}経由で受付。顧客: ${customerName}`,
      visible_to_partner: true,
      created_by: null,
    })

    // Notification → partner
    if (partner?.profile_id) {
      await createNotification(
        supabase,
        link.partner_id,
        '新しい案件が受付されました',
        `${customerName} — ${service?.name ?? link.service_id}`,
        { type: 'deal', id: deal.id },
      )
    }

    await notifySlack(`🆕 新規案件（紹介）: ${customerName} — ${service?.name ?? link.service_id}（${partner?.code ?? ''}）`)

    // Audit log
    await supabase.from('audit_logs').insert({
      actor_profile_id: null,
      actor_name: 'システム',
      category: '案件',
      target: customerName,
      action: `紹介登録(${source})`,
      meta: {
        deal_id: deal.id,
        partner_id: link.partner_id,
        service_id: link.service_id,
        token,
      },
    })

    return NextResponse.json({ success: true, dealId: deal.id })
  } catch (err) {
    console.error('referral API error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
