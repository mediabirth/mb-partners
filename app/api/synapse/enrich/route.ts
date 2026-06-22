import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE 仕事リスト化（T1）：未読みの見込み（needs あり・読み未設定）に、困りごとから直接“読み”を一括付与。
// ★会話を介さない。本人スコープ（.eq partner_id）厳守。サービス目録は読むだけ。お金/deals/帰属/通知は非接触。
// ★捏造ガード：適合サービスは目録名と完全一致時のみ採用、無ければ null（無適合でも enriched_at を立て“一度きり”）。
// ★Feature C 基盤：partner-auth必須・ai_usage日次上限・ANTHROPIC_API_KEY未設定なら{disabled:true}・Anthropic REST(Node)。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
const BATCH = 15   // 1回の付与で処理する未読み件数の上限（コスト制御）。
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1200

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

const SELECT = 'id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, source, created_at, updated_at'

export async function POST() {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true })

    const admin = await createServiceRoleClient()

    // 未読み＝困りごとあり・読み未設定・未処理（本人スコープ）。
    const { data: unreadData } = await admin.from('synapse_contacts')
      .select('id, needs, industry, company')
      .eq('partner_id', partnerId).is('suggested_service', null).is('enriched_at', null).not('needs', 'is', null)
      .order('created_at', { ascending: false }).limit(BATCH)
    const unread = (unreadData ?? []) as Array<{ id: string; needs: string | null; industry: string | null; company: string | null }>
    if (unread.length === 0) return NextResponse.json({ updated: [] })

    // レート上限（1回の一括付与で +1）。
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })

    const { data: svcData } = await admin.from('services').select('name, subtitle, description').eq('active', true).order('sort', { ascending: true })
    const services = (svcData ?? []) as Array<{ name: string; subtitle: string | null; description: string | null }>
    const serviceNames = services.map(s => s.name)
    const catalog = services.map(s => `- ${s.name}（${s.subtitle ?? ''}）: ${(s.description ?? '').slice(0, 100)}`).join('\n')

    const SYSTEM_PROMPT = [
      'あなたは「SYNAPSE」。各見込みの困りごとに対し、MBサービスの適合（読み）と刺さる切り口を、確信がある時だけ付けるコネクターです。',
      '',
      '【MBサービス目録（この name だけ適合候補にできる。創作禁止）】',
      catalog,
      '',
      '【ルール】',
      '・各見込みについて {"id":..., "service":<目録のname>|null, "angle":<刺さる切り口・短い1文>|null} を返す。',
      '・service は目録の name と完全一致のみ。確信が無ければ service=null, angle=null（無理な当てはめ禁止＝正直に）。',
      '・angle は service がある時だけ。簡潔に。',
      '出力は次のJSONのみ（前置き・コードフェンス無し）：{"readings":[{"id":string,"service":string|null,"angle":string|null}]}',
    ].join('\n')

    const listText = unread.map(u => `[id:${u.id}] 困りごと:${u.needs}${u.industry ? ` / 業種:${u.industry}` : ''}${u.company ? ` / 会社:${u.company}` : ''}`).join('\n')
    const userMsg = `次の見込みそれぞれに読みを付けてください。\n${listText}`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ error: '生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()
    let parsed: any = null
    try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }

    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    const unreadIds = new Set(unread.map(u => u.id))
    const now = new Date().toISOString()
    const readings = parsed && Array.isArray(parsed.readings) ? parsed.readings : []
    // 適合のみ保存（捏造ガード：目録一致時のみ service 採用）。本人スコープ更新。
    for (const r of readings) {
      const id = typeof r?.id === 'string' ? r.id : null
      if (!id || !unreadIds.has(id)) continue
      const svc = typeof r?.service === 'string' && serviceNames.includes(r.service.trim()) ? r.service.trim() : null
      const angle = svc && typeof r?.angle === 'string' && r.angle.trim() ? r.angle.trim().slice(0, 400) : null
      await admin.from('synapse_contacts')
        .update({ suggested_service: svc, suggested_angle: angle, enriched_at: now })
        .eq('id', id).eq('partner_id', partnerId)
    }
    // 取りこぼし（モデル無返答）も含め、送った未読みは全て enriched_at を立てる＝再処理しない。
    await admin.from('synapse_contacts').update({ enriched_at: now })
      .eq('partner_id', partnerId).is('enriched_at', null).in('id', [...unreadIds])

    // 更新後の見込みを返す（カード即時反映用）。
    const { data: fresh } = await admin.from('synapse_contacts').select(SELECT).eq('partner_id', partnerId).in('id', [...unreadIds])
    return NextResponse.json({ updated: fresh ?? [] })
  } catch {
    return NextResponse.json({ error: '生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
