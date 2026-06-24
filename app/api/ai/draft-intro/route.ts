import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { DRAFT_DAILY_PER_USER, aiGlobalDailyExceeded, AI_BUSY_MESSAGE } from '@/lib/ai-limits'

// バッチC：AI紹介文ドラフト生成（partner認証必須・サーバ専用）。
// ★これはテキスト生成の“補助”。紹介の作成・帰属・お金・deals には一切関与しない。
// ★ANTHROPIC_API_KEY はサーバ専用（NEXT_PUBLIC_ を付けない）。未設定でも安全に動く（disabled応答）。
// web系SDKは使わず Anthropic REST を fetch（依存追加なし）。Node ランタイム。
// ★品質が要る紹介文生成のため MODEL は haiku 据え置き（コスト×品質バランス）。全体/日サーキットブレーカ併設。
export const runtime = 'nodejs'

const DAILY_LIMIT = DRAFT_DAILY_PER_USER
// 品質維持のため Haiku 据え置き（紹介文は据え置き＝モデル切替の対象外）。
const MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 600

const SYSTEM_PROMPT = [
  'あなたは日本のB2Bビジネス文脈に精通したアシスタントです。',
  '紹介者が「紹介先の相手（企業・担当者）」へ送る、礼儀正しく簡潔な紹介文を日本語で生成してください。',
  '誇張・虚偽の実績や金額は決して書かないこと。',
  '宛名や署名は [お名前] [貴社名] [あなたのお名前] のようなプレースホルダで構いません。',
  '出力は紹介文の本文のみ。前置きや解説は不要です。',
].join('\n')

// 認証必須：本人の partner.id を解決（匿名・別partnerは拒否）。
async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

// 機能の有効/無効（APIキー設定有無）だけを返す。パネルの表示判定に使用。
export async function GET() {
  const partnerId = await resolvePartnerId()
  if (!partnerId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ enabled: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  try {
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })

    // graceful degradation：キー未設定なら API を叩かず disabled を返す（500にしない）。
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ disabled: true })

    const b = await req.json().catch(() => ({}))
    const contact = typeof b.contact === 'string' ? b.contact.trim().slice(0, 200) : ''
    const need    = typeof b.need === 'string' ? b.need.trim().slice(0, 600) : ''
    const service = typeof b.service === 'string' ? b.service.trim().slice(0, 200) : ''
    const tone    = typeof b.tone === 'string' ? b.tone.trim().slice(0, 40) : ''
    if (!contact && !need) {
      return NextResponse.json({ error: '紹介先かニーズのいずれかを入力してください' }, { status: 400 })
    }

    // レート上限：当日 count を確認（service_role＝RLSバイパス、ai_usage は隔離テーブル）。
    const admin = await createServiceRoleClient()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()) // YYYY-MM-DD(JST)
    const { data: usage } = await admin
      .from('ai_usage').select('count').eq('partner_id', partnerId).eq('day', day).maybeSingle()
    const used = usage?.count ?? 0
    if (used >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: `本日のAI生成回数の上限（${DAILY_LIMIT}回/日）に達しました。明日また自動的にご利用いただけます。` },
        { status: 429 },
      )
    }
    // 全体/日サーキットブレーカ（暴走時の保険・全パートナー合計）。
    if (await aiGlobalDailyExceeded(admin, day)) return NextResponse.json({ error: AI_BUSY_MESSAGE }, { status: 429 })

    // 入力を整形して user メッセージに。
    const userMsg = [
      '次の条件で、紹介先の相手に送る紹介文を作成してください。',
      contact && `・紹介先の相手（企業/担当者）: ${contact}`,
      need && `・相手の課題/ニーズ: ${need}`,
      service && `・紹介したいサービス: ${service}`,
      tone && `・文体/トーン: ${tone}`,
      '',
      '丁寧で簡潔に。読み手がメリットを理解し、次のアクション（問い合わせ/面談）に進みやすい文面にしてください。',
    ].filter(Boolean).join('\n')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: '生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    }
    const json: any = await resp.json()
    const draft = (Array.isArray(json?.content) ? json.content : [])
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
      .trim()
    if (!draft) {
      return NextResponse.json({ error: '生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
    }

    // 成功時のみ count++（upsert）。失敗・上限・disabled では加算しない。
    await admin
      .from('ai_usage')
      .upsert({ partner_id: partnerId, day, count: used + 1 }, { onConflict: 'partner_id,day' })

    return NextResponse.json({ draft })
  } catch {
    return NextResponse.json({ error: '生成に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
