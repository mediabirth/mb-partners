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

  if (!customerName) throw new Error('お客様情報は必須です')
  // v3.1/①：連絡先必須（相談起票を除く）。法人＝メール必須／個人＝電話orメールいずれか必須。client と二重で担保。
  if (!isConsultation) {
    if (customerType === 'corporate') {
      if (!customerEmail) throw new Error('メールアドレスをご入力ください')
    } else if (!(phone ?? '').trim() && !customerEmail) throw new Error('電話番号かメールアドレスのいずれかをご入力ください')
  }

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

  // 新モデル：申し込まれた報酬（menu_rewards）があれば amount/reward_snapshot をその報酬から（計算式は不変＝固定即額/率は確定時）。
  // snapshot は rateInfo 互換のため reward_* と ref_* の両キーで焼く。
  let rewardSnapshot: Record<string, unknown> | null = menu ?? null
  let continuousMonths: number | null = null   // 継続案件の期間（メニューの default_months を凍結・案件ごと後で変更可）
  if (rewardRefRaw) {
    const { data: mr } = await supabase.from('menu_rewards').select('*').eq('id', rewardRefRaw).single()
    if (mr) {
      // fixed=即額／rate・continuous=確定時(または月次)に算出＝作成時 amount は 0。継続も 0（毎月は continuous_payouts）。
      amount = mr.reward_type === 'fixed' ? Number(mr.reward_value || 0) : 0
      rewardSnapshot = {
        ...mr,
        reward_type: mr.reward_type, reward_value: mr.reward_value, reward_base: mr.reward_base, reward_trigger: mr.reward_trigger,
        ref_type: mr.reward_type, ref_value: mr.reward_value, ref_base: mr.reward_base,
        // 継続条件を凍結（メニュー側の率・期間が後で変わっても確定済み月は不変）。
        months: mr.reward_type === 'continuous' ? (mr.default_months ?? null) : null,
      }
      if (mr.reward_type === 'continuous') continuousMonths = mr.default_months ?? null
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

  // ②b: 法人の部署・役職を保存（任意・additive）。contact_title 列が未追加でも deal 作成を壊さない best-effort。
  if (customerType === 'corporate' && contactTitle) {
    const { error: titleErr } = await supabase.from('deals').update({ contact_title: contactTitle }).eq('id', deal!.id)
    if (titleErr) { /* 列未追加(DDL前) 等は無視 */ }
  }

  // 段階4：新メニュー参照 menu_ref を記録（任意・additive・best-effort）。
  // ★money計算・reward_snapshot・channel・既存 menu_id には触れない。新規案件を新モデルへ繋ぐ追跡列のみ。
  if (rewardRefRaw) {
    const { error: rrErr } = await supabase.from('deals').update({ reward_ref: rewardRefRaw }).eq('id', deal!.id)
    if (rrErr) { /* 列未追加 等は無視 */ }
  }
  if (menuRefRaw) {
    const { error: menuRefErr } = await supabase.from('deals').update({ menu_ref: menuRefRaw }).eq('id', deal!.id)
    if (menuRefErr) { /* 列未追加・不正id 等は無視（申込は成立） */ }
  }

  // ③: 協力の対応範囲 項目別同意を記録（任意・additive・揉め防止の証跡）。
  // coverage_agreed 列が未追加(DDL前)でも deal 作成を壊さない best-effort。
  // ★④報酬ゲート(deal_tasks)・帰属(partner_id)・money には一切触れない申込時UI同意の記録。
  if (channel === 'cooperation' && coverageAgreedRaw) {
    try {
      const parsed = JSON.parse(coverageAgreedRaw)
      const { error: covErr } = await supabase.from('deals').update({ coverage_agreed: parsed }).eq('id', deal!.id)
      if (covErr) { /* 列未追加(DDL前) 等は無視 */ }
    } catch { /* 不正JSONは無視 — 申込は成立させる（後方互換） */ }
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
        await instantiateDealTasks(admin, { id: deal!.id, service_id: serviceId, menu_id: menuId || null, menu_ref: menuRefRaw || null, reward_ref: rewardRefRaw || null, channel })
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

  // v3.1：パートナー向け通知から「協力/関わり方」の区分を排除（内部データ channel は不変）。
  const caseUrl = `https://mb-partners.app/app/cases/${deal!.id}`
  const menuName = (menu as { name?: string } | null)?.name ?? ''
  const { data: svcRow } = isConsultation ? { data: null } : await supabase.from('services').select('name').eq('id', serviceId).single()
  const svcName = svcRow?.name ?? ''
  const menuLine = [svcName, menuName].filter(Boolean).join(' ─ ') || '—'

  await notifySlackEvent('new_deal', `新規案件${isConsultation ? '（相談・サービス未定）' : ''}: ${customerName}（登録: ${profile?.name ?? 'パートナー'}）`)

  // 運営メール（配信>自動メッセージ 'ops-new-deal' テンプレ優先・無ければ既定文面）。best-effort。
  try {
    const { sendOpsEmail } = await import('@/lib/notify')
    const { resolveTemplate } = await import('@/lib/notify/template-resolve')
    const vars = { customer: customerName, menu: menuLine, partner: profile?.name ?? 'パートナー', link: caseUrl }
    const opsFallback = `新規案件が登録されました。${isConsultation ? '\n・種別：相談（サービス未定）' : ''}\n・お客さま：${customerName}\n・メニュー：${menuLine}\n・登録：${profile?.name ?? 'パートナー'}\n・案件ページ：${caseUrl}`
    const opsBody = (await resolveTemplate('ops-new-deal', vars)) ?? opsFallback
    await sendOpsEmail(`【MB Partners】新規案件: ${customerName}`, opsBody)
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

  // C2④ パートナー本人へ受付確認メール（ベストエフォート・v3.1：紹介で統一・案件ページURL付き）
  try {
    if (profile?.email) {
      const { sendReceiptEmail } = await import('@/lib/email')
      const { customerHonorific } = await import('@/lib/customer')
      await sendReceiptEmail({
        to: profile.email,
        partnerName: profile.name,
        kind: 'referral',
        customerName: customerHonorific({ customer_type: customerType, company_name: companyName, contact_name: contactName, customer_name: customerName }),
        serviceName: svcName || null,
        menuName: menuName || null,
        caseUrl,
      })
    }
  } catch { /* best-effort */ }

  revalidatePath('/app')
  return { dealId: deal!.id }
}
