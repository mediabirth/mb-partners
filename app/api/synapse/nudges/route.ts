import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE Phase 2「掘る」（P2-2）：SYNAPSEから能動的に問いかける nudge を生成。
// 本人の synapse_contacts（.eq partner_id）＋ MBサービス目録(read-only) を踏まえ、眠っている種を掘り起こす。
//   (a) followup：困りごと×適合あり・未行動(acted_at null) → 「その後どうですか／紹介文は送りましたか？」
//   (b) dormant：明確な困りごとがあるのに動いていない → 「まだ動けます」
//   (c) seed：新しい種を引き出す問い（新規連絡先）
// ★本人スコープ厳守（他人の台帳は読まない）。捏造ガード（適合は目録名と完全一致時のみ）。
// ★partner-auth必須・ai_usage日次上限・ANTHROPIC_API_KEY未設定なら{disabled:true}（nudge非表示）。お金/帰属/通知は非接触。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 800

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

export async function GET() {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true, nudges: [] })

    const admin = await createServiceRoleClient()

    // 本人の台帳のみ（.eq partner_id 厳守）。
    const { data: cData } = await admin.from('synapse_contacts')
      .select('id, name, company, industry, needs, suggested_service, suggested_angle, acted_at')
      .eq('partner_id', partnerId).order('created_at', { ascending: false }).limit(40)
    const contacts = (cData ?? []) as Array<{ id: string; name: string | null; company: string | null; industry: string | null; needs: string | null; suggested_service: string | null; suggested_angle: string | null; acted_at: string | null }>

    // 台帳が空なら AI を使わず（ai_usage 消費なし）、種を掘る問いだけ返す。
    if (contacts.length === 0) {
      return NextResponse.json({ nudges: [{ id: 'seed-empty', kind: 'seed', title: '最初の種を掘る', body: '最近お会いした方で、採用や新規事業、集客などで困っていそうな方はいませんか？お一人、思い浮かべて教えてください。', contactId: null, contactName: null }] })
    }

    // レート上限。
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) return NextResponse.json({ nudges: [] })  // 上限時は静かに非表示

    const { data: svcData } = await admin.from('services').select('name, subtitle, description').eq('active', true).order('sort', { ascending: true })
    const services = (svcData ?? []) as Array<{ name: string; subtitle: string | null; description: string | null }>
    const catalog = services.map(s => `- ${s.name}（${s.subtitle ?? ''}）`).join('\n')

    const ledger = contacts.map(c => `[id:${c.id}] ${c.name ?? '名称未設定'}${c.company ? `／${c.company}` : ''}${c.industry ? `（${c.industry}）` : ''} 困りごと:${c.needs ?? '未記録'} 読み:${c.suggested_service ?? 'なし'} 行動:${c.acted_at ? '対応済み' : '未行動'}`).join('\n')

    const SYSTEM_PROMPT = [
      'あなたは「SYNAPSE」。パートナー専用の、洞察あるコネクターです。受け身ではなく“取りに行く”側として、本人の台帳から眠っている紹介の種を掘り起こす問いを作ります。',
      '温かく簡潔に。尋問にしない。捏造禁止（適合MBサービスは下の目録名と完全一致時のみ・無ければ触れない）。',
      '',
      '【MBサービス目録（name のみ適合候補に使える）】',
      catalog,
      '',
      '【nudgeの3種】',
      '・followup：困りごとが明確で適合サービス(読み)があり、まだ未行動の相手へ。「〜の件その後いかがですか？紹介文はもう送られましたか？」のように、相手の文脈を入れて。',
      '・dormant：明確な困りごとがあるのに動いていない機会へ。「まだ動けます」と背中を押す。',
      '・seed：新しい種を引き出す一般的な問い（新規連絡先を思い出させる）。',
      '',
      '最大3件。対象がある場合は contactId に台帳の id を入れる（seedは null）。body は本人にそのまま見せる問い（相手の文脈を含めてよい）。',
      '出力は次のJSONのみ（前置き・コードフェンス無し）：',
      '{"nudges":[{"kind":"followup|dormant|seed","title":string,"body":string,"contactId":string|null}]}',
    ].join('\n')

    const userMsg = `【本人の台帳】\n${ledger}\n\n上記から、いま掘り起こすべき問いを最大3件、指定のJSONで返してください。`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ nudges: [] })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()
    let parsed: any = null
    try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }

    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    const byId = Object.fromEntries(contacts.map(c => [c.id, c]))
    const str = (v: any, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
    const rawNudges = parsed && Array.isArray(parsed.nudges) ? parsed.nudges : []
    const nudges = rawNudges.slice(0, 3).map((n: any, i: number) => {
      const kind = ['followup', 'dormant', 'seed'].includes(n?.kind) ? n.kind : 'seed'
      const cid = typeof n?.contactId === 'string' && byId[n.contactId] ? n.contactId : null
      return { id: `n${i}-${cid ?? 'seed'}`, kind, title: str(n?.title, 80) ?? '問いかけ', body: str(n?.body, 500) ?? '', contactId: cid, contactName: cid ? (byId[cid].name ?? byId[cid].company ?? null) : null }
    }).filter((n: any) => n.body)

    return NextResponse.json({ nudges })
  } catch {
    return NextResponse.json({ nudges: [] })
  }
}
