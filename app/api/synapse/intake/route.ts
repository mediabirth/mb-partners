import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE 作り直し（R3/R5）：話すと“読みと次の一手”が返る機会エンジン。
// 会話(messages[]) を受け、本人の台帳context＋MBサービス目録(read-only)を併用して：
//   reply（理解を示す自然な応答）／reading（適合MBサービス＋なぜ＋切り口・確信がある時だけ）／
//   crossRef（本人台帳のクロス参照）／question（重大信号が欠けた時だけ1問）／draft（保存用の副産物）。
// ★保存しない。サービス目録は読むだけ（変更しない）。お金/deals/frontier/帰属/通知には一切触れない。
// ★Feature C 基盤：partner-auth必須・ai_usage日次上限・ANTHROPIC_API_KEY未設定なら{disabled:true}・Anthropic REST(Node)。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
const MODEL = 'claude-sonnet-4-6'   // 品質優先。コスト次第で 'claude-haiku-4-5-20251001' に差替可（この1行）。
const MAX_TOKENS = 900

type Msg = { role: 'user' | 'assistant'; content: string }

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

export async function GET() {
  const partnerId = await resolvePartnerId()
  if (!partnerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true })   // graceful degrade

    const b = await req.json().catch(() => ({}))
    const messages: Msg[] = (Array.isArray(b.messages) ? b.messages : [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
      .slice(-14)
    if (messages.length === 0) return NextResponse.json({ error: '話す内容を入力してください' }, { status: 400 })

    const admin = await createServiceRoleClient()

    // レート上限（ai_usage 共用・隔離テーブル）。
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) {
      return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })
    }

    // MBサービス目録（read-only）＝“何を”の自社限定マッチ用。
    const { data: svcData } = await admin.from('services').select('name, subtitle, description, who').eq('active', true).order('sort', { ascending: true })
    const services = (svcData ?? []) as Array<{ name: string; subtitle: string | null; description: string | null; who: string | null }>
    const serviceNames = services.map(s => s.name)
    const catalog = services.map(s => `- ${s.name}（${s.subtitle ?? ''}）: ${(s.description ?? '').slice(0, 120)}${s.who ? ` / 想定顧客: ${s.who.slice(0, 80)}` : ''}`).join('\n')

    // 本人の台帳（クロス参照用・本人スコープ）。名前・困りごと・業種のみ。
    const { data: ledgerData } = await admin.from('synapse_contacts')
      .select('name, needs, industry').eq('partner_id', partnerId).order('created_at', { ascending: false }).limit(20)
    const ledger = (ledgerData ?? []) as Array<{ name: string | null; needs: string | null; industry: string | null }>
    const ledgerSummary = ledger.filter(l => l.needs || l.name).map(l => `・${l.name ?? '名称未設定'}${l.industry ? `（${l.industry}）` : ''}: ${l.needs ?? '困りごと未記録'}`).join('\n') || '（まだ台帳に登録はありません）'

    const SYSTEM_PROMPT = [
      'あなたは「SYNAPSE」。パートナー専用の、洞察あるコネクターです。ロボット的でなく、温かく簡潔に。',
      'パートナーが「最近会った人・知り合い」について話します。あなたの仕事は、相手と困りごとを理解し、',
      '“確信がある時だけ”MBサービスとの適合（読み）と、刺さる具体的な切り口（angle）と、台帳のクロス参照を返すこと。',
      '',
      '【MBサービス目録（この中の name だけを適合候補にできる。創作禁止）】',
      catalog,
      '',
      '【最優先の原則】',
      '・最初の応答から“読み”を返す。例文程度（業種・困りごと・経緯のいずれか）が揃っていれば即・読みを返す。尋問しない。',
      '・“何を”は必ず上のMBサービスに限定（自社限定）。reading.service は目録の name と完全一致、無ければ null。',
      '・適合に確信が無ければ捏造せず正直に：reading=null、reply で「今ピッタリのMBサービスは無いが、台帳に残せば後で繋がる」と伝える。無理な当てはめ厳禁。',
      '・question は“重大な信号が欠けている時だけ”1問。揃っていれば null。',
      '・crossRef：本人台帳に同種の課題があれば一言触れる（無ければ null）。',
      '・draft は会話の副産物（保存用）。分かる範囲で。会話に無い情報は創作しない（不明は null、needs は空配列可）。',
      '',
      '【本人の台帳（クロス参照に使う・他言しない）】',
      ledgerSummary,
      '',
      '【出力：次のJSONのみ（前置き・コードフェンス無し）】',
      '{"reply": string, "reading": {"service": string, "why": string, "angle": string} | null, "crossRef": string | null, "question": string | null, "draft": {"name": string|null, "company": string|null, "industry": string|null, "role": string|null, "relationship": string|null, "needs": string[], "notes": string|null} | null}',
    ].join('\n')

    const transcript = messages.map(m => `${m.role === 'assistant' ? 'SYNAPSE' : '本人'}: ${m.content}`).join('\n')
    const userMsg = `これまでの会話:\n${transcript}\n\n上記を踏まえ、指定のJSONだけで返答してください。`

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ error: '応答に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()

    let parsed: any = null
    try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ error: 'うまく聞き取れませんでした。もう少し具体的にお話しください。' }, { status: 422 })

    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    const str = (v: any, n = 2000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

    // reading：service は目録名と完全一致した時だけ採用（捏造ガード）。
    let reading: { service: string; why: string; angle: string } | null = null
    if (parsed.reading && typeof parsed.reading === 'object') {
      const svc = str(parsed.reading.service, 80)
      if (svc && serviceNames.includes(svc)) {
        reading = { service: svc, why: str(parsed.reading.why, 400) ?? '', angle: str(parsed.reading.angle, 400) ?? '' }
      }
    }

    const d = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : null
    const needsArr = d && Array.isArray(d.needs) ? d.needs.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 8) : []
    const draft = d ? {
      name: str(d.name), company: str(d.company), industry: str(d.industry), role: str(d.role),
      relationship: str(d.relationship), needs: needsArr.join('、') || null, notes: str(d.notes),
    } : null

    return NextResponse.json({
      reply: str(parsed.reply, 800) ?? 'なるほど、うかがいました。',
      reading,
      crossRef: str(parsed.crossRef, 400),
      question: str(parsed.question, 300),
      draft,
    })
  } catch {
    return NextResponse.json({ error: '応答に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
