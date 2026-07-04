/**
 * GET /api/cron/reminders  — 商談リマインド（Vercel Cron 15分毎）
 *
 * 今後の商談を走査し、JST基準で2段のリマインドを送る：
 *   - prev_day_18 … 前日18:00(JST)相当を過ぎたら
 *   - hour_before … 開始1時間前を過ぎたら
 * 宛先：運営(Slack)・担当パートナー(メール)・お客様(メール・連絡先がある場合のみ)。
 *
 * 商談ソースは2系統：
 *   ① meetings（公開予約・client_email あり）
 *   ② deals.meeting_at（パートナーが案件に設定・顧客メールなし）
 *
 * 多重送信防止：meeting_reminders(unique(meeting_id,kind,recipient))。
 * 同テーブル未作成時は「送信せず」要DDLを返す（スパム防止＝fail-closed）。
 *
 * 認証：Vercel Cron が付与する Authorization: Bearer <CRON_SECRET>。
 * node ランタイム（DB書込＋複数送信のため）。すべて best-effort（money path 非接触）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendSlack, sendEmail, fmtJST } from '@/lib/notify'

type Mtg = { id: string; partnerId: string; startAt: string; customer: string; clientEmail: string | null; meetingUrl: string | null }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = await createServiceRoleClient()

  // dedup テーブル存在チェック（無ければ送らない＝スパム防止）
  const probe = await svc.from('meeting_reminders').select('id').limit(1)
  if (probe.error) {
    return NextResponse.json({ ok: false, skipped: 'meeting_reminders テーブル未作成（要DDL）', code: probe.error.code })
  }

  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const horizon = new Date(now + 48 * 3600 * 1000).toISOString()   // 前日18:00相当を取り逃さない窓

  // 商談ソース①: meetings（公開予約・顧客メールあり）。meeting_url 列が未追加なら列なしで再取得。
  let mtgs = (await svc.from('meetings')
    .select('id, partner_id, start_at, client_name, client_email, status, meeting_url')
    .eq('status', 'booked')
    .gte('start_at', nowIso).lte('start_at', horizon)).data as Array<Record<string, unknown>> | null
  if (!mtgs) {
    mtgs = ((await svc.from('meetings')
      .select('id, partner_id, start_at, client_name, client_email, status')
      .eq('status', 'booked')
      .gte('start_at', nowIso).lte('start_at', horizon)).data ?? []).map(m => ({ ...m, meeting_url: null }))
  }

  // 商談ソース②: deals.meeting_at（パートナー設定）。customer_email があれば顧客にも送る。
  // customer_email / meeting_url 列が未追加(部分DDL)の場合は列なしで再取得（null 扱い）。
  let dls = (await svc.from('deals')
    .select('id, partner_id, customer_name, meeting_at, status, customer_email, meeting_url')
    .not('meeting_at', 'is', null).neq('status', 'paid')
    .gte('meeting_at', nowIso).lte('meeting_at', horizon)).data as Array<Record<string, unknown>> | null
  if (!dls) {
    dls = ((await svc.from('deals')
      .select('id, partner_id, customer_name, meeting_at, status')
      .not('meeting_at', 'is', null).neq('status', 'paid')
      .gte('meeting_at', nowIso).lte('meeting_at', horizon)).data ?? []).map(d => ({ ...d, customer_email: null, meeting_url: null }))
  }

  const meetings: Mtg[] = [
    ...(mtgs ?? []).map(m => ({ id: m.id as string, partnerId: m.partner_id as string, startAt: m.start_at as string, customer: m.client_name as string, clientEmail: (m.client_email as string | null) ?? null, meetingUrl: (m.meeting_url as string | null) ?? null })),
    ...dls.map(d => ({ id: d.id as string, partnerId: d.partner_id as string, startAt: d.meeting_at as string, customer: d.customer_name as string, clientEmail: (d.customer_email as string | null) ?? null, meetingUrl: (d.meeting_url as string | null) ?? null })),
  ].filter(m => m.partnerId)

  if (!meetings.length) return NextResponse.json({ ok: true, scanned: 0, sent: 0 })

  // パートナー → profile(email,name)
  const partnerIds = [...new Set(meetings.map(m => m.partnerId))]
  const { data: parts } = await svc.from('partners').select('id, profile_id').in('id', partnerIds)
  const profIdByPartner: Record<string, string> = Object.fromEntries((parts ?? []).map(p => [p.id, p.profile_id]))
  const profIds = [...new Set(Object.values(profIdByPartner).filter(Boolean))]
  const { data: profs } = await svc.from('profiles').select('id, name, email').in('id', profIds)
  const profById: Record<string, { name: string | null; email: string | null }> = Object.fromEntries((profs ?? []).map(p => [p.id, p]))

  // 既送信セット
  const { data: sentRows } = await svc.from('meeting_reminders')
    .select('meeting_id, kind, recipient').in('meeting_id', meetings.map(m => m.id))
  const already = new Set((sentRows ?? []).map(r => `${r.meeting_id}|${r.kind}|${r.recipient}`))

  const J = 9 * 3600 * 1000
  const prevDay18 = (startIso: string): number => {
    const sJ = new Date(new Date(startIso).getTime() + J)   // JSTカレンダー日を得る
    return Date.UTC(sJ.getUTCFullYear(), sJ.getUTCMonth(), sJ.getUTCDate(), 18, 0, 0) - J - 24 * 3600 * 1000
  }
  const record = async (meeting_id: string, kind: string, recipient: string) => {
    try { await svc.from('meeting_reminders').insert({ meeting_id, kind, recipient }) } catch { /* unique conflict ok */ }
  }

  let sent = 0
  for (const m of meetings) {
    const startMs = new Date(m.startAt).getTime()
    if (startMs <= now) continue                       // 開始済みは送らない
    const prof = profById[profIdByPartner[m.partnerId]]
    const partnerEmail = prof?.email ?? null
    const partnerName = prof?.name ?? 'パートナー'
    const whenJa = fmtJST(m.startAt)
    const meetLine = m.meetingUrl ? `\n・Meet：${m.meetingUrl}` : ''
    const meetSlack = m.meetingUrl ? `\nMeet: ${m.meetingUrl}` : ''

    const stages = [
      { kind: 'prev_day_18', trigger: prevDay18(m.startAt), soon: false },
      { kind: 'hour_before', trigger: startMs - 3600 * 1000, soon: true },
    ]
    for (const st of stages) {
      if (now < st.trigger) continue                   // 発火時刻前
      const head = st.soon ? 'まもなく' : '明日'
      // 運営（Slack）
      if (process.env.SLACK_WEBHOOK_URL && !already.has(`${m.id}|${st.kind}|ops`)) {
        const r = await sendSlack(`⏰ 商談リマインド（${head}）: ${m.customer} — ${whenJa}（担当: ${partnerName}）${meetSlack}`)
        if (r.sent) { await record(m.id, st.kind, 'ops'); sent++ }
      }
      // 担当パートナー（メール・テンプレ経由=DB上書き可＋送信履歴）
      if (partnerEmail && !already.has(`${m.id}|${st.kind}|partner`)) {
        const { sendTemplatedEmail } = await import('@/lib/mail-send')
        const r = await sendTemplatedEmail({
          key: 'reminder-partner', to: partnerEmail, toRole: 'partner',
          vars: { name: partnerName, customer: m.customer, when: whenJa, stage: head, meetingUrl: m.meetingUrl ?? '' },
          fallback: {
            subject: `【MB Partners】${st.soon ? 'まもなく商談のお時間です' : '明日の商談リマインド'}`,
            text: `${partnerName} 様\n${st.soon ? 'まもなく商談のお時間です。' : '明日の商談予定のご案内です。'}\n・お客さま：${m.customer}\n・日時：${whenJa}${meetLine}`,
          },
          meta: { meeting_id: m.id, stage: st.kind },
        })
        if (r.sent) { await record(m.id, st.kind, 'partner'); sent++ }
      }
      // お客さま（メール・連絡先がある場合のみ）
      if (m.clientEmail && !already.has(`${m.id}|${st.kind}|client`)) {
        const { sendTemplatedEmail } = await import('@/lib/mail-send')
        const r = await sendTemplatedEmail({
          key: 'reminder-customer', to: m.clientEmail, toRole: 'customer',
          vars: { customer: `${m.customer} 様`, when: whenJa, stage: head, meetingUrl: m.meetingUrl ?? '' },
          fallback: {
            subject: `【MB Partners】ご商談${st.soon ? '開始前' : '前日'}のご案内`,
            text: `${m.customer} 様\n${st.soon ? 'まもなくご商談のお時間です。' : '明日のご商談のご案内です。'}\n・日時：${whenJa}${meetLine}\nどうぞよろしくお願いいたします。`,
          },
          meta: { meeting_id: m.id, stage: st.kind },
        })
        if (r.sent) { await record(m.id, st.kind, 'client'); sent++ }
      }
    }
  }

  return NextResponse.json({ ok: true, scanned: meetings.length, sent })
}
