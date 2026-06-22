import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE 名簿化（N3）：会社URLを取得→本文をAIに渡し 業種/規模/想定ニーズ を抽出→該当見込みに自動記入＋提案。
// ★本人スコープ（.eq partner_id）厳守。サービス目録は読むだけ。お金/deals/帰属/通知は非接触。捏造ガード（目録名一致のみ）。
// ★URL取得は基本SSRF対策：http/https のみ・内部/予約IP遮断・タイムアウト・サイズ上限・GETのみ。
// ★partner-auth必須・ai_usage日次上限・ANTHROPIC_API_KEY未設定なら{disabled:true}。Anthropic REST(Node)。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 700
const FETCH_TIMEOUT_MS = 6000
const MAX_BYTES = 300_000
const SELECT = 'id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, source, created_at, updated_at'

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

// 基本SSRF対策：http/https のみ、内部/予約アドレスを遮断。
function safeUrl(raw: string): URL | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return null
  if (host.includes(':')) return null // 生IPv6リテラル（::1/fc00 等）を遮断
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    const p = host.split('.').map(Number)
    if (p.some(n => n > 255)) return null
    if (p[0] === 10 || p[0] === 127 || p[0] === 0) return null
    if (p[0] === 169 && p[1] === 254) return null // link-local＋メタデータ
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return null
    if (p[0] === 192 && p[1] === 168) return null
    if (p[0] >= 224) return null
  }
  return u
}

async function fetchText(u: URL): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(u.toString(), { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'SYNAPSE-bot/1.0', accept: 'text/html,text/plain' } })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (!r.ok || !(ct.includes('text/html') || ct.includes('text/plain') || ct === '')) return null
    const buf = await r.arrayBuffer()
    const bytes = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf
    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    // ざっくりタグ除去＋圧縮（script/style除去）。
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    return text.slice(0, 6000) || null
  } catch { return null } finally { clearTimeout(t) }
}

export async function POST(req: NextRequest) {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true })

    const b = await req.json().catch(() => ({}))
    const id = typeof b.id === 'string' ? b.id : ''
    const u = safeUrl(typeof b.url === 'string' ? b.url : '')
    if (!id) return NextResponse.json({ error: '対象がありません' }, { status: 400 })
    if (!u) return NextResponse.json({ error: '有効なURL（http/https）を入力してください' }, { status: 400 })

    const admin = await createServiceRoleClient()
    // 対象が本人の見込みであることを確認（本人スコープ）。
    const { data: target } = await admin.from('synapse_contacts').select('id').eq('id', id).eq('partner_id', partnerId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // レート上限。
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })

    const pageText = await fetchText(u)
    if (!pageText) return NextResponse.json({ error: 'ページを取得できませんでした。URLをご確認ください。' }, { status: 422 })

    const { data: svcData } = await admin.from('services').select('name, subtitle, description').eq('active', true).order('sort', { ascending: true })
    const services = (svcData ?? []) as Array<{ name: string; subtitle: string | null; description: string | null }>
    const serviceNames = services.map(s => s.name)
    const catalog = services.map(s => `- ${s.name}（${s.subtitle ?? ''}）: ${(s.description ?? '').slice(0, 100)}`).join('\n')

    const SYSTEM_PROMPT = [
      'あなたは「SYNAPSE」。企業サイトの本文から、その会社の 業種・規模・想定される困りごと を読み取り、MBサービスの適合（読み）を確信がある時だけ付けるコネクターです。',
      '',
      '【MBサービス目録（この name だけ適合候補にできる。創作禁止）】',
      catalog,
      '',
      '【ルール】',
      '・本文に書かれていることだけから推定。書かれていなければ null（憶測で断定しない）。',
      '・industry=業種(短語)、size=規模(従業員/売上感など分かる範囲・短語)、needs=想定される困りごと(短い1文)。',
      '・service は目録の name と完全一致のみ。確信が無ければ service=null, angle=null（無理な当てはめ禁止）。',
      '出力は次のJSONのみ（前置き・コードフェンス無し）：{"industry":string|null,"size":string|null,"needs":string|null,"service":string|null,"angle":string|null}',
    ].join('\n')
    const userMsg = `次の企業サイト本文から読み取ってください。\nURL: ${u.toString()}\n----\n${pageText}\n----`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ error: '解析に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()
    let parsed: any = null
    try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    if (!parsed) return NextResponse.json({ error: 'うまく読み取れませんでした。' }, { status: 422 })

    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    const str = (v: any, n = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
    const industry = str(parsed.industry, 80)
    const size = str(parsed.size, 80)
    const needs = str(parsed.needs, 600)
    const service = typeof parsed.service === 'string' && serviceNames.includes(parsed.service.trim()) ? parsed.service.trim() : null
    const angle = service ? str(parsed.angle, 400) : null

    // 既存の値があれば尊重しつつ、空欄を埋める（本人確認できるよう更新後を返す）。url/scanned_at は記録。
    const patch: Record<string, string | null> = { url: u.toString(), scanned_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (industry) patch.industry = industry
    if (size) patch.company_size = size
    if (needs) patch.needs = needs
    if (service) { patch.suggested_service = service; patch.suggested_angle = angle; patch.enriched_at = new Date().toISOString() }

    const { data: updated } = await admin.from('synapse_contacts').update(patch).eq('id', id).eq('partner_id', partnerId).select(SELECT).maybeSingle()
    return NextResponse.json({ contact: updated, filled: { industry, size, needs, service, angle } })
  } catch {
    return NextResponse.json({ error: '解析に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
