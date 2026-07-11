import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { notifySlackEvent } from '@/lib/slack'
import { requiredTasksDone, markAutoTaskDone } from '@/lib/coop-tasks'

export const runtime = 'edge'

const STATUS_LABEL: Record<string, string> = { received: '受付', in_progress: '対応中', confirmed: '成約確定', paid: '支払済', lost: '不成立' }
const LOST_REASONS = ['予算', 'タイミング', '競合', '連絡途絶', 'ニーズ不一致', 'お客様都合', 'その他']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { status, base_amount, lost_reason, lost_note } = body
  const hasStatus = typeof status === 'string'
  const hasBase = base_amount != null && base_amount !== ''

  if (!hasStatus && !hasBase) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const valid = ['received', 'in_progress', 'confirmed', 'paid', 'lost']
  if (hasStatus && !valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  // ⑧ Reward resolution. cooperation → 選択メニューの coop_*。紹介ダウングレード時は ref_*。
  const { data: ctx } = await supabase
    .from('deals')
    .select('channel, amount, base_amount, status, partner_id, service_id, reward_snapshot, menu_id, service_menus(coop_enabled, coop_type, coop_value, coop_base, ref_type, ref_value, ref_base)')
    .eq('id', id)
    .single()

  // N: 支払済は不成立に変更不可（金額確定済）。
  if (hasStatus && status === 'lost' && ctx?.status === 'paid') {
    return NextResponse.json({ error: '支払済の案件は不成立にできません' }, { status: 400 })
  }

  const menu = (ctx?.service_menus ?? null) as {
    coop_enabled: boolean | null; coop_type: string | null; coop_value: number | null; coop_base: string | null
    ref_type?: string | null; ref_value?: number | null; ref_base?: string | null
  } | null
  const snap = (ctx?.reward_snapshot ?? null) as { ref_type?: string; ref_value?: number; ref_base?: string } | null
  const confirming = hasStatus && status === 'confirmed'

  // P: 報酬ゲート(a)。協力で必須タスク未達なら紹介レートへダウングレード（締め前のレート決定にのみ作用）。
  // fail-open：deal_tasks が無い/読めない場合は協力レート維持（requiredTasksDone が true を返す）。
  const admin = await createServiceRoleClient()

  // L3: 明細0件（相談・サービス未割当）の deal は確定不可。fail-open（deal_items 未作成なら従来どおり）。
  if (confirming) {
    try {
      const { count, error: cntErr } = await admin.from('deal_items').select('id', { count: 'exact', head: true }).eq('deal_id', id)
      if (!cntErr && (count ?? 0) === 0) {
        return NextResponse.json({ error: 'サービス明細を1つ以上追加してください', needsItems: true }, { status: 400 })
      }
    } catch { /* fail-open */ }
  }

  let effectiveKind: string = ctx?.channel ?? 'referral'
  let gateReason: string | null = null
  if (ctx?.channel === 'cooperation') {
    const passed = confirming ? await requiredTasksDone(admin, id) : true
    effectiveKind = passed ? 'cooperation' : 'referral'
    if (confirming && !passed) gateReason = '協力の必須タスク未達のため紹介レートを適用'
  }

  // 採用レート。協力(通過)=coop_*、協力ダウングレード=ref_*、生来の紹介=従来どおり。
  let rate: number | null = null        // 料率(%)案件 → base 必要
  let fixedAmount: number | null = null // 固定 → amount=固定額
  let baseLabel = '売上'
  const refType  = menu?.ref_type ?? snap?.ref_type
  const refValue = Number(menu?.ref_value ?? snap?.ref_value ?? 0)
  const refBase  = menu?.ref_base ?? snap?.ref_base ?? '売上'
  if (effectiveKind === 'cooperation' && menu?.coop_enabled) {
    baseLabel = menu.coop_base ?? '売上'
    if ((menu.coop_type ?? 'rate') === 'fixed') fixedAmount = Number(menu.coop_value ?? 0)
    else rate = Number(menu.coop_value ?? 0)
  } else if (ctx?.channel === 'cooperation') {
    // 協力→紹介ダウングレード：ref_* を採用
    baseLabel = refBase
    if (refType === 'rate') rate = refValue
    else if (refType === 'fixed') fixedAmount = refValue
  } else if (snap?.ref_type === 'rate') {
    // 生来の紹介(rate)：従来どおり
    rate = Number(snap.ref_value); baseLabel = snap.ref_base ?? '売上'
  }
  const isRate = rate != null && !Number.isNaN(rate)

  // ライフサイクル: 率案件は報酬確定（base確定・報酬計算済）前に支払済にできない（支払う額が存在しないため）。
  if (hasStatus && status === 'paid' && isRate && (ctx?.base_amount ?? null) == null && !hasBase) {
    return NextResponse.json({ error: '報酬が未確定です。粗利の確定（報酬を確定する）を先に行ってください', needsBase: true }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (hasStatus) update.status = status

  // ① 料率案件：実額(base)入力で 報酬=base×率 を即時計算・保存（どのステータスでも可）
  if (isRate && hasBase) {
    const base = Number(base_amount)
    if (Number.isNaN(base) || base <= 0) return NextResponse.json({ error: 'invalid base_amount' }, { status: 400 })
    const computed = Math.round(base * (rate as number) / 100)
    update.base_amount = base
    update.amount = computed
    update.reward_snapshot = { ...(snap ?? {}), base_amount: base, base_label: baseLabel, rate, computed }
  } else if (confirming) {
    if (fixedAmount != null) {
      // 固定（協力 or ダウングレード紹介・固定）：実額不要、報酬=固定額
      update.amount = fixedAmount
      update.reward_snapshot = { ...(snap ?? {}), reward_type: 'fixed', base_label: baseLabel, computed: fixedAmount }
    } else if (isRate) {
      // ライフサイクル: 率案件は base（実額）が未確定のまま成約できる（勝彦フロー: 成約→受注額確定→…→経費承認→粗利算出→報酬確定）。
      // 成約時点では報酬条件（rate/base_label）のみsnapshotに固定し、報酬額は「報酬を確定する」（①のbase書込）で後日確定する。
      const existing = ctx?.base_amount ?? null
      if (existing == null) {
        update.reward_snapshot = { ...(snap ?? {}), base_label: baseLabel, rate, computed: null }
      } else {
        update.amount = Math.round(Number(existing) * (rate as number) / 100)
        update.reward_snapshot = { ...(snap ?? {}), base_amount: Number(existing), base_label: baseLabel, rate, computed: update.amount }
      }
    }
    // 生来の紹介(fixed)はamount既定のまま
  }

  // P: 成約時はゲート判定結果を記録（reward_snapshot は jsonb で必ず書ける）。
  if (confirming) {
    update.reward_snapshot = {
      ...((update.reward_snapshot as object) ?? snap ?? {}),
      effective_kind: effectiveKind,
      ...(gateReason ? { gate_reason: gateReason } : {}),
    }
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .update(update)
    .eq('id', id)
    .select('id, customer_name, status, amount, base_amount')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // P0-a: 系統連動レートの条件を再凍結（confirmを通過するたび上書き＝差し戻し→再成約も同一規則・best-effort）。仕様正典 v2 §2。
  if (confirming) {
    try {
      const { freezeFeeSnapshot } = await import('@/lib/supplier-fee')
      const { data: cur } = await admin.from('deals').select('partner_id, service_id').eq('id', id).single()
      await freezeFeeSnapshot(admin, id, { partnerId: (cur?.partner_id as string | null) ?? null, serviceId: (cur?.service_id as string | null) ?? null })
    } catch { /* best-effort */ }
  }

  // L2: 確定時に報酬を「明細の合算」で恒久化（凍結対象 deals.amount に反映）。回帰ゼロ設計：
  //   - 明細1件 → 上で算出した legacy 確定額（deal.amount/base_amount）へ明細を同期するだけ（金額は legacy と同一・L1 driftも解消）。
  //   - 明細複数 → effectiveKind を全明細に適用して再集計し deals.amount を上書き（複数明細dealのみ・既存単一には無影響）。
  //   - 明細が無い/読めない → 何もしない（fail-open・legacy のまま）。
  if (confirming) {
    try {
      const { computeDealReward } = await import('@/lib/deal-reward')
      const { data: items } = await admin.from('deal_items').select('id, service_id, menu_id, kind, amount, base_amount').eq('deal_id', id).order('sort')
      const now2 = new Date().toISOString()
      if (items && items.length === 1) {
        // 単一明細：確定値へ同期（金額は legacy と完全一致）
        await admin.from('deal_items').update({ amount: deal.amount, base_amount: deal.base_amount ?? null, updated_at: now2 }).eq('id', items[0].id)
      } else if (items && items.length > 1) {
        // 複数明細：メニューを引いて effectiveKind で再集計
        const menuIds = [...new Set(items.map(i => i.menu_id).filter(Boolean))] as string[]
        const { data: menus } = await admin.from('service_menus').select('id, coop_enabled, coop_type, coop_value, coop_base, ref_type, ref_value, ref_base').in('id', menuIds)
        const menusById = Object.fromEntries((menus ?? []).map(m => [m.id, m]))
        const { total, baseTotal, breakdown } = computeDealReward(items, effectiveKind, menusById)
        await admin.from('deals').update({
          amount: total,
          base_amount: baseTotal || null,
          reward_snapshot: { ...((update.reward_snapshot as object) ?? snap ?? {}), effective_kind: effectiveKind, ...(gateReason ? { gate_reason: gateReason } : {}), items: breakdown },
        }).eq('id', id)
        // 各明細の報酬を同期（Σ(items.amount)=deals.amount を保つ）
        for (const b of breakdown) if (b.id) await admin.from('deal_items').update({ amount: b.reward, updated_at: now2 }).eq('id', b.id)
      }
    } catch { /* fail-open: 明細集約に失敗しても legacy の deals.amount を維持 */ }
  }

  // P: effective_kind 列に記録（列未追加(DDL前)でも本体更新を壊さない best-effort）。
  if (confirming) {
    try { await admin.from('deals').update({ effective_kind: effectiveKind }).eq('id', id) } catch { /* 列なし時は無視 */ }
    // 自動チェック：成約に伴い「対応開始」auto タスクも完了扱い（冪等）。
    await markAutoTaskDone(admin, id, 'in_progress')
  }
  // P: 対応中遷移で auto タスク（trigger 'in_progress'）を完了（冪等・best-effort）。
  if (hasStatus && status === 'in_progress') {
    await markAutoTaskDone(admin, id, 'in_progress')
  }

  if (hasStatus) {
    const isLost = status === 'lost'

    // P: 協力→紹介ダウングレード時は監査/タイムラインに理由を残す（パートナーには出さない）。
    if (confirming && gateReason) {
      await supabase.from('deal_events').insert({
        deal_id: id, body: `報酬レート判定：${gateReason}`, created_by: user.id, visible_to_partner: false,
      })
    }

    // N: 失注メタデータ保存 / 再開時クリア。lost_* 列が未追加(DDL前)でも本体更新を壊さない best-effort。
    try {
      if (isLost) {
        const reason = LOST_REASONS.includes(lost_reason) ? lost_reason : null
        const note = typeof lost_note === 'string' && lost_note.trim() ? lost_note.trim().slice(0, 500) : null
        await supabase.from('deals').update({ lost_at: new Date().toISOString(), lost_reason: reason, lost_note: note }).eq('id', id)
      } else {
        // 再開（不成立→対応中 等）：失注メタデータをクリア
        await supabase.from('deals').update({ lost_at: null, lost_reason: null, lost_note: null }).eq('id', id)
      }
    } catch { /* 列なし時は無視 */ }

    // 監査/タイムライン。lost は中立な内部記録（顧客向けには出さない）。
    await supabase.from('deal_events').insert({
      deal_id: id,
      body: isLost ? '案件をクローズしました（不成立）' : `ステータスを「${STATUS_LABEL[status as string]}」に変更しました`,
      created_by: user.id,
      visible_to_partner: ['confirmed', 'paid'].includes(status),
    })

    // N: 運営Slackは lost には送らない（ひっそり中立）。他のステータス変更は従来通り。
    if (!isLost) {
      await notifySlackEvent('status_change', `📋 案件ステータス変更: ${deal?.customer_name ?? id} → ${STATUS_LABEL[status as string]}`)
      // D: 運営メールも併送（Slack障害時に運営が気づけない欠落への回答・best-effort）。
      try {
        const { sendOpsEmail } = await import('@/lib/notify')
        await sendOpsEmail(
          `【MB Partners】案件ステータス変更: ${deal?.customer_name ?? id}`,
          `案件のステータスが「${STATUS_LABEL[status as string]}」になりました。\n・お客さま：${deal?.customer_name ?? '-'}\n・案件ID：${id}`,
        )
      } catch { /* best-effort */ }
    }

    // D: 受付→対応中の遷移でパートナーへ状況更新メール（従来は両端＝受付/不成立/成約しか届かず中間経過が皆無だった）。
    // 遷移時のみ（ctx.status が既に in_progress なら送らない）＝多重送信防止。best-effort。磨き①: テンプレ経由。
    if (status === 'in_progress' && ctx?.status !== 'in_progress' && ctx?.partner_id) {
      try {
        const { sendTemplatedEmail } = await import('@/lib/mail-send')
        const { customerHonorific } = await import('@/lib/customer')
        const { data: pt } = await admin.from('partners').select('profile_id').eq('id', ctx.partner_id).single()
        const { data: pr } = pt?.profile_id
          ? await admin.from('profiles').select('name, email').eq('id', pt.profile_id).single()
          : { data: null }
        if (pr?.email) {
          const { data: dd } = await admin.from('deals')
            .select('customer_name, customer_type, company_name, contact_name').eq('id', id).single()
          const customerLabel = dd ? (customerHonorific(dd as never) || 'お客さま') : 'お客さま'
          const link = `https://mb-partners.app/app/cases/${id}`
          await sendTemplatedEmail({
            key: 'deal-status-update', to: pr.email, toRole: 'partner',
            vars: { name: pr.name ?? 'パートナー', customer: customerLabel, link },
            buttons: [{ label: '案件ページを見る', url: link }],
            meta: { deal_id: id },
          })
        }
      } catch { /* best-effort */ }
    }

    // N: 不成立化時に担当パートナーへ中立・感謝メール1通（best-effort・運営Slackには送らない）。
    if (isLost) {
      try {
        const { data: pt } = await admin.from('partners').select('profile_id').eq('id', ctx?.partner_id ?? '').single()
        const { data: pr } = pt?.profile_id
          ? await admin.from('profiles').select('name, email').eq('id', pt.profile_id).single()
          : { data: null }
        if (pr?.email) {
          const { sendTemplatedEmail } = await import('@/lib/mail-send')
          await sendTemplatedEmail({
            key: 'deal-lost-partner', to: pr.email, toRole: 'partner',
            vars: { name: pr.name ?? 'パートナー' },
            meta: { deal_id: id },
          })
        }
      } catch { /* best-effort */ }
    }
  }

  // ④b: 成約「確定コミット後」に勝ち通知を fire-and-forget（内部nodejsエンドポイント→inbox+Web Push fan-out）。
  // ★状態遷移（遷移前≠confirmed）時のみ＝多重送信防止。読み取りのみで status/お金/帰属は不変。
  // ★通知失敗は成約処理を絶対に壊さない（try/catchで握りつぶし・ロールバックさせない）。
  if (confirming && ctx?.status !== 'confirmed') {
    try {
      await fetch(`${new URL(req.url).origin}/api/internal/deal-won`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
        body: JSON.stringify({ dealId: id }),
        signal: AbortSignal.timeout(4000),
      })
    } catch { /* 通知失敗は成約を壊さない（fire-and-forget・握りつぶし） */ }
  }

  return NextResponse.json({ deal })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: deal } = await supabase.from('deals').select('status').eq('id', id).single()
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (deal.status === 'paid') return NextResponse.json({ error: 'Cannot cancel a paid deal' }, { status: 400 })

  // deals には delete の RLS ポリシーが無く、ユーザークライアントの delete は 0行マッチのまま
  // 200 を返す（＝取り消しが一度も効いていなかった根因）。role 検査済みのうえ service_role で実行し、
  // .select() で削除行の実在まで検証する。
  const admin = await createServiceRoleClient()
  const { data: deleted, error } = await admin.from('deals').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: 'Delete had no effect' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
