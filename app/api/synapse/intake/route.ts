import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE Phase 0.5（S2）：AIヒアリングの“会話化”。
// 私的秘書が短い会話で聞き取り → 信号が薄ければ温かい追い質問(1〜2問)、十分ならドラフト(構造化候補)を返す。
// ★保存しない（保存は本人が確認・編集後に /api/synapse/contacts）。尋問にしない＝質問は最大ラウンドで打ち切り。
// ★Feature C 基盤：partner-auth必須・ai_usage日次上限・ANTHROPIC_API_KEY未設定なら{disabled:true}・Anthropic REST(Node)。
// ★お金・/r帰属・既存通知トリガには一切触れない。
export const runtime = 'nodejs'

const DAILY_LIMIT = 20
const MAX_QUESTION_ROUNDS = 2   // 追い質問はこのラウンド数で打ち切り、以降は今ある情報でドラフト化。
// 品質優先で Sonnet。コストを見て 'claude-haiku-4-5-20251001' に差し替え可（この1行のみ）。
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 700

const SYSTEM_PROMPT = [
  'あなたは日本のビジネスパーソンの“私的な秘書”です。パートナーが「最近会った人・知り合い」について話すのを、温かく短く聞き取ります。',
  '最優先で引き出す信号は「困りごと/ニーズ」「関係性（どう繋がったか）」「業種」。些末な項目（住所・細かい肩書等）は聞きません。',
  '出力は必ず次のいずれかのJSONのみ（前置き・解説・コードフェンス無し）：',
  '  追い質問する場合: {"action":"ask","questions":["…","…"]}  ※質問は最大2問・短く温かい口調・尋問にしない。',
  '  ドラフトを作る場合: {"action":"draft","draft":{"name":string|null,"company":string|null,"industry":string|null,"role":string|null,"relationship":string|null,"needs":string[],"notes":string|null}}',
  '判断基準：困りごと/ニーズ・関係性・業種のうち2つ以上が分かればドラフトに進む。会話に無い情報は創作しない（不明はnull、needsは空配列）。',
  '相手が短文・回答を渋っている様子なら、無理に質問せず今ある情報でドラフトにする。',
].join('\n')

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

type Msg = { role: 'user' | 'assistant'; content: string }

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
      .slice(-12)
    if (messages.length === 0) return NextResponse.json({ error: '聞き取り内容を入力してください' }, { status: 400 })

    // レート上限（Feature C と同じ ai_usage を共用・隔離テーブル）。
    const admin = await createServiceRoleClient()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
    const { data: usage } = await admin.from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) {
      return NextResponse.json({ error: `本日のAI利用上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` }, { status: 429 })
    }

    // 既にAIが質問したラウンド数。上限に達したら以降は必ずドラフト化（尋問防止）。
    const askedRounds = messages.filter(m => m.role === 'assistant').length
    const forceDraft = askedRounds >= MAX_QUESTION_ROUNDS

    const transcript = messages.map(m => `${m.role === 'assistant' ? '秘書' : '本人'}: ${m.content}`).join('\n')
    const userMsg = [
      'これまでのヒアリング:',
      transcript,
      '',
      forceDraft
        ? 'これ以上は質問せず、今ある情報だけで必ず action="draft" のJSONを返してください。'
        : '情報が薄ければ action="ask"（最大2問）、困りごと/関係性/業種のうち2つ以上が分かれば action="draft" のJSONを返してください。',
    ].join('\n')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMsg }] }),
    })
    if (!resp.ok) return NextResponse.json({ error: '抽出に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    const json: any = await resp.json()
    const text = (Array.isArray(json?.content) ? json.content : []).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n').trim()

    let parsed: any = null
    try { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : null } catch { parsed = null }
    if (!parsed || typeof parsed !== 'object') return NextResponse.json({ error: 'うまく聞き取れませんでした。もう少し具体的にお話しください。' }, { status: 422 })

    // 成功時のみ count++。
    await admin.from('ai_usage').upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 2000) : null)

    // 追い質問（上限未満のときのみ）。
    if (!forceDraft && parsed.action === 'ask' && Array.isArray(parsed.questions)) {
      const questions = parsed.questions.filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim().slice(0, 200)).slice(0, 2)
      if (questions.length > 0) return NextResponse.json({ questions, round: askedRounds + 1 })
    }

    // ドラフト（action=draft、または上限到達でフォールバック）。
    const d = (parsed.action === 'draft' && parsed.draft && typeof parsed.draft === 'object') ? parsed.draft : (parsed.draft ?? {})
    const needsArr = Array.isArray(d?.needs) ? d.needs.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 8) : []
    const draft = {
      name: str(d?.name),
      company: str(d?.company),
      industry: str(d?.industry),
      role: str(d?.role),
      relationship: str(d?.relationship),
      needs: needsArr.join('、') || null,
      notes: str(d?.notes),
    }
    return NextResponse.json({ draft })
  } catch {
    return NextResponse.json({ error: '抽出に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
