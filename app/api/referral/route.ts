import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { notifySlackEvent } from '@/lib/slack'

export const runtime = 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // ③ B2B 任意項目を additive 受領（帰属insert には不使用＝後段の best-effort update のみで保存）。
    const { token, customerName, phone, memo, via, companyName, contactName, contactTitle, customerEmail, customerType } = body

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

    // ③ 信頼ランディングのB2B任意項目を additive 保存（帰属insertは上記で完了・不変＝この別updateは
    //    partner_id/channel/source/consent/amount に一切触れない）。列未追加でも作成を壊さない best-effort。
    {
      const b2b: Record<string, unknown> = {}
      if (customerType === 'corporate') b2b.customer_type = 'corporate'
      if (companyName)  b2b.company_name  = companyName
      if (contactName)  b2b.contact_name  = contactName
      if (contactTitle) b2b.contact_title = contactTitle
      if (customerEmail) b2b.customer_email = customerEmail
      if (Object.keys(b2b).length) {
        const { error: b2bErr } = await supabase.from('deals').update(b2b).eq('id', deal.id)
        if (b2bErr) { /* 列未追加(DDL前) 等は無視 — 表示メタのみ */ }
      }
    }

    // L1: 明細1行を同時生成（best-effort・外見不変。deals.amount = SUM(deal_items.amount) を維持）。
    try {
      const { createDealItem, dealItemKind } = await import('@/lib/deal-items')
      await createDealItem(supabase, {
        deal_id: deal.id, service_id: link.service_id, menu_id: menu?.id ?? null,
        kind: dealItemKind('referral', menu as { ref_type?: string } | null), amount, base_amount: null,
      })
    } catch { /* best-effort */ }

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

    await notifySlackEvent('new_deal', `新規案件: ${customerName} — ${service?.name ?? link.service_id}（${partner?.code ?? ''}）`)

    // 運営メール（Slackは既存のnew_dealゲート送信を流用・二重送信しない）。best-effort。
    try {
      const { sendOpsEmail } = await import('@/lib/notify')
      await sendOpsEmail(
        `【MB Partners】新規案件: ${customerName}`,
        `新規案件が登録されました。\n・お客さま：${customerName}\n・メニュー：${service?.name ?? link.service_id}\n・パートナー：${partner?.code ?? '—'}`,
      )
    } catch { /* best-effort */ }

    // D: お客さま本人へ受付確認メール（連絡先がある場合のみ・best-effort）。磨き①: テンプレ経由。
    try {
      if (customerEmail) {
        const { sendTemplatedEmail } = await import('@/lib/mail-send')
        const { customerHonorific } = await import('@/lib/customer')
        const label = customerHonorific({ customer_type: customerType, company_name: companyName, contact_name: contactName, customer_name: customerName }) || 'お客さま'
        await sendTemplatedEmail({
          key: 'customer-receipt', to: customerEmail, toRole: 'customer',
          vars: { customer: label, partner: '', service: service?.name ?? '' },
          meta: { deal_id: deal.id },
        })
      }
    } catch { /* best-effort */ }

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
