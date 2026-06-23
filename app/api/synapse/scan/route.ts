import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { safeUrl, extractText, extractAddress, extractAddressLinks } from '@/lib/synapse-fetch'

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
const SELECT = 'id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, enriched_at, url, company_size, scanned_at, entity_type, phone, address, demand_summary, demand_tags, recommended_services, source, created_at, updated_at'

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

async function fetchRaw(u: URL): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(u.toString(), { method: 'GET', redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'SYNAPSE-bot/1.0', accept: 'text/html,text/plain' } })
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    if (!r.ok || !(ct.includes('text/html') || ct.includes('text/plain') || ct === '')) return null
    const buf = await r.arrayBuffer()
    const bytes = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
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
    // 既存値（空欄のみ自動記入のため事実フィールドを読む）。
    const { data: target } = await admin.from('synapse_contacts').select('id, company, industry, company_size, phone, address, entity_type').eq('id', id).eq('partner_id', partnerId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // レート上限。
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })

    const topHtml = await fetchRaw(u)
    if (!topHtml) return NextResponse.json({ error: 'ページを取得できませんでした。URLをご確認ください。' }, { status: 422 })
    // トップは先頭6000字＋末尾2000字（フッター＝住所が集中）を連結。住所抽出のフッター取りこぼしを防ぐ。
    const topText = extractText(topHtml)
    let pageText = topText.length > 8000
      ? `${topText.slice(0, 6000)}\n\n[フッター]\n${topText.slice(-2000)}`
      : topText
    // B：会社概要/特商法等の同一ドメインページを最大2件追加取得（住所抽出の堅牢化・SSRFガード再適用）。
    for (const link of extractAddressLinks(topHtml, u)) {
      const sub = await fetchRaw(link)
      if (sub) pageText += `\n\n[追加ページ ${link.pathname}]\n${extractText(sub).slice(0, 3000)}`
    }
    pageText = pageText.slice(0, 14000)

    // サービス目録（read-only）＝推奨サービスの捏造ガード用（完全一致のみ採用）。
    const { data: svcData } = await admin.from('services').select('name, subtitle, description').eq('active', true).order('sort', { ascending: true })
    const services = (svcData ?? []) as Array<{ name: string; subtitle: string | null; description: string | null }>
    const serviceNames = services.map(s => s.name)
    const catalog = services.map(s => `- ${s.name}（${s.subtitle ?? ''}）: ${(s.description ?? '').slice(0, 90)}`).join('\n')

    const serviceList = JSON.stringify(serviceNames)   // 推奨サービスはこの配列の文字列のみ（生成時点で目録一致を保証）。
    const SYSTEM_PROMPT = [
      'あなたは「SYNAPSE」。企業サイトの本文から、(1)事実と(2)需要分析 を読み取るアナリストです。',
      '',
      '【MBサービス目録（参考）】',
      catalog,
      `【recommended_services に使ってよい文字列（この配列の値そのものだけ・一字一句一致）】 ${serviceList}`,
      '',
      '【出力する内容】',
      '(1) 事実：',
      '    company=会社名（記載があれば）。',
      '    industry=業種（短語。サイト内容から判断）。',
      '    size=規模の「短い一言ラベルのみ」（例「従業員 約40名」「中規模」「小規模」）。根拠や長文は入れない（根拠は demand_summary 側へ）。記載が無くても短い推定ラベルを必ず入れる（null禁止）。',
      '    phone=電話番号（記載が無ければ null）。',
      '    address=住所。会社概要・会社情報・特定商取引法（特商法）・アクセス・フッター等の記載から抽出（無ければ null・捏造しない）。',
      '(2) 需要分析：',
      '    demand_summary=「この会社は〜。傾向として〜。よって〜という需要があり得る」の形の短い文章（2〜3文）。',
      '    demand_tags=需要の「キーワード」配列（切り口・3〜5個・各短語。例：採用強化／EC立ち上げ／DX・業務効率化／ブランド刷新／販路拡大）。',
      '    recommended_services=上の「使ってよい文字列」配列から選んだ値のみ（0〜3個・確信が無ければ空配列）。配列に無い名称は出力しない。',
      '',
      '【ガード】憶測で事実を断定しない（size の推定は根拠を添える）。情報不足時は tags/services を減らし、demand_summary に「情報が不足」と正直に書く。',
      '出力は次のJSONのみ（前置き・コードフェンス無し）：',
      '{"company":string|null,"industry":string|null,"size":string|null,"phone":string|null,"address":string|null,"demand_summary":string|null,"demand_tags":string[],"recommended_services":string[]}',
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
    const t = target as any
    const empty = (v: any) => !(typeof v === 'string' && v.trim())   // 既存が空欄か
    // (1) 事実：空欄のみ自動記入（既存値は絶対に上書きしない）。
    // 住所は決定的抽出（正規表現）を優先・AI返却はフォールバック。
    const addrFromText = extractAddress(pageText)
    const facts = { company: str(parsed.company, 200), industry: str(parsed.industry, 80), size: str(parsed.size, 30), phone: str(parsed.phone, 60), address: addrFromText || str(parsed.address, 300) }
    const filledFacts: Record<string, string> = {}
    const patch: Record<string, any> = { url: u.toString(), scanned_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (facts.company && empty(t.company)) { patch.company = facts.company; filledFacts.company = facts.company }
    if (facts.industry && empty(t.industry)) { patch.industry = facts.industry; filledFacts.industry = facts.industry }
    if (facts.size && empty(t.company_size)) { patch.company_size = facts.size; filledFacts.size = facts.size }
    if (facts.phone && empty(t.phone)) { patch.phone = facts.phone; filledFacts.phone = facts.phone }
    if (facts.address && empty(t.address)) { patch.address = facts.address; filledFacts.address = facts.address }
    // 会社サイトなので法人と推定（entity_type 空欄のみ）。
    if (empty(t.entity_type)) patch.entity_type = 'corporate'
    // (2) 需要分析：read-onlyな知能＝常に最新で保存（事実ではないので更新OK）。
    const demand_summary = str(parsed.demand_summary, 800)
    const demand_tags = Array.isArray(parsed.demand_tags) ? parsed.demand_tags.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, 40)).slice(0, 5) : []
    // 推奨サービスは目録名と完全一致のみ採用（捏造ガード）。
    const recommended_services = Array.isArray(parsed.recommended_services)
      ? [...new Set(parsed.recommended_services.filter((x: any) => typeof x === 'string' && serviceNames.includes(x.trim())).map((x: string) => x.trim()))].slice(0, 3)
      : []
    patch.demand_summary = demand_summary
    patch.demand_tags = demand_tags
    patch.recommended_services = recommended_services

    // ★⑤バグ修正：update 後に必ず本人スコープで再取得して返す（書込→再描画の結線を保証）。
    await admin.from('synapse_contacts').update(patch).eq('id', id).eq('partner_id', partnerId)
    const { data: updated } = await admin.from('synapse_contacts').select(SELECT).eq('id', id).eq('partner_id', partnerId).maybeSingle()
    return NextResponse.json({ contact: updated, filledFacts, demand_summary, demand_tags, recommended_services })
  } catch {
    return NextResponse.json({ error: '解析に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
