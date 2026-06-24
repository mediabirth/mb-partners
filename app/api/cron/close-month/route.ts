import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveTemplate } from '@/lib/notify/template-resolve'

// Vercel Cron calls this route at schedule defined in vercel.json.
// Auth: Bearer CRON_SECRET header (set as Vercel env var).
export async function GET(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Determine target month ────────────────────────────────────
  // Use ?month=YYYY-MM param, or default to previous month
  let targetMonth = req.nextUrl.searchParams.get('month')
  if (!targetMonth) {
    const now = new Date()
    // Run on last day of month → close CURRENT month
    // If called on e.g. June 30, close '2026-06'
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  // ── Execute batch ─────────────────────────────────────────────
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase.rpc('close_month_batch', { target_month: targetMonth })

  if (error) {
    console.error('[cron/close-month] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 締め時点で override を凍結（payout_overrides 未作成時は no-op）
  try {
    const batchId = (data as { batch_id?: string } | null)?.batch_id
    if (batchId) {
      const { freezeOverridesForBatch } = await import('@/lib/frontier-payout')
      await freezeOverridesForBatch(supabase, batchId, targetMonth)
    }
  } catch { /* best-effort */ }

  // Batch B ④: 支払確定通知（運営Slack/メール＋該当パートナーへ「報酬が確定しました」）。
  // money path はRPCで確定済み。以降は best-effort（例外は握りつぶし締め処理に影響させない）。
  // 多重送信防止：自動月末締め（?month指定なし）かつ JST 月末日に走った回のみ通知。
  try {
    const result = data as { batch_id?: string } | null
    const batchId = result?.batch_id
    const explicitMonth = req.nextUrl.searchParams.get('month')
    const nowJst = new Date(Date.now() + 9 * 3600 * 1000)
    const lastDay = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth() + 1, 0)).getUTCDate()
    const isMonthEnd = nowJst.getUTCDate() === lastDay
    if (batchId && isMonthEnd && !explicitMonth) {
      const { sendSlack, sendOpsEmail, sendEmail } = await import('@/lib/notify')
      const { data: items } = await supabase.from('payout_items').select('partner_id, net').eq('batch_id', batchId)
      const list = items ?? []
      const totalNet = list.reduce((s, i) => s + (i.net ?? 0), 0)
      await sendSlack(`💰 ${targetMonth} 支払確定：${list.length}名 / 手取り総額 ¥${totalNet.toLocaleString()}`)
      await sendOpsEmail(`【MB Partners】${targetMonth} 支払確定`, `月次締めが確定しました。\n・対象月：${targetMonth}\n・対象パートナー：${list.length}名\n・手取り総額：¥${totalNet.toLocaleString()}`)
      if (list.length) {
        const partnerIds = list.map(i => i.partner_id)
        const { data: parts } = await supabase.from('partners').select('id, profile_id').in('id', partnerIds)
        const profIdByPartner: Record<string, string> = Object.fromEntries((parts ?? []).map(p => [p.id, p.profile_id]))
        const profIds = [...new Set(Object.values(profIdByPartner).filter(Boolean))]
        const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', profIds)
        const profById: Record<string, { name: string | null; email: string | null }> = Object.fromEntries((profs ?? []).map(p => [p.id, p]))
        for (const it of list) {
          if ((it.net ?? 0) <= 0) continue
          const prof = profById[profIdByPartner[it.partner_id]]
          if (!prof?.email) continue
          // ★金額算出(it.net)・対象判定・締め/payout/凍結は不変。本文textのみ templates 優先（無ければ既存文面）。
          const amount = `¥${(it.net ?? 0).toLocaleString()}`
          const defaultText = `${prof.name ?? 'パートナー'} 様\n${targetMonth} 分の報酬が確定しました。\n・手取り：${amount}\n明細はアプリの「報酬」からご確認いただけます。`
          const text = (await resolveTemplate('payout-confirmed', { name: prof.name ?? 'パートナー', month: targetMonth, amount })) ?? defaultText
          await sendEmail({
            to: prof.email,
            subject: '【MB Partners】今月の報酬が確定しました',
            text,
          })
        }
      }
    }
  } catch { /* best-effort — 通知失敗は締め処理に影響しない */ }

  console.log('[cron/close-month] success:', JSON.stringify(data))
  return NextResponse.json({ ok: true, result: data })
}
