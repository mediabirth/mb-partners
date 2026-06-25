/**
 * メッセージセンター Phase3-C：自動メッセージ文面の templates 解決（読み取り専用・additive）。
 * resolveTemplate(category, vars) → message_templates の is_active かつ該当category の最新1件を service_role SELECT し、
 * body のプレースホルダ ${key} を vars で安全置換して返す。該当なし/例外時は null（呼び出し側は既存ハードコード文面へフォールバック）。
 *
 * ★AIコールなし・DB SELECT のみ。money/deals/帰属/status には一切触れない。例外は投げない（必ず null で握る）。
 * ★各通知の発火・宛先・チャネル・notify()ディスパッチは本ヘルパーの対象外（本文stringのみを供給）。
 */
import { createServiceRoleClient } from '@/lib/supabase/server'

export type TemplateVars = Record<string, string | number | null | undefined>

/** ${key} を vars[key] で置換。未知キーはそのまま残す（誤爆防止）。 */
function fill(body: string, vars: TemplateVars): string {
  return body.replace(/\$\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key]
    return v === undefined || v === null ? whole : String(v)
  })
}

/** 該当categoryのテンプレ本文（プレースホルダ展開済）。未設定/空/例外は null＝既存文面フォールバック。 */
export async function resolveTemplate(category: string, vars: TemplateVars = {}): Promise<string | null> {
  try {
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('message_templates')
      .select('body')
      .eq('is_active', true).eq('category', category)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const body = (data?.body as string | undefined)?.trim()
    if (!body) return null
    return fill(body, vars)
  } catch {
    return null
  }
}

export type TemplateImage = { type: 'image'; path: string }
export type TemplateButton = { label: string; url: string }
export type ResolvedTemplate = { body: string | null; attachments: TemplateImage[]; buttons: TemplateButton[] }

/**
 * Phase3-D① additive：本文に加えてテンプレ画像も返す。未設定/例外は null。
 * ★resolveTemplate と完全に独立。既存6呼び出しのフォールバック挙動は不変（こちらは画像対応箇所のみ使用）。
 * body は空でも attachments があれば返す（画像のみテンプレ）。両方なければ null。
 */
export async function resolveTemplateMedia(category: string, vars: TemplateVars = {}): Promise<ResolvedTemplate | null> {
  try {
    const admin = await createServiceRoleClient()
    const { data } = await admin.from('message_templates')
      .select('body, attachments, buttons')
      .eq('is_active', true).eq('category', category)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data) return null
    const rawBody = (data.body as string | undefined)?.trim()
    const body = rawBody ? fill(rawBody, vars) : null
    const attachments = (Array.isArray(data.attachments) ? data.attachments : [])
      .filter((a: { type?: string; path?: string }) => a?.type === 'image' && typeof a?.path === 'string')
      .map((a: { path: string }) => ({ type: 'image' as const, path: a.path }))
    // buttons: label/url を vars 展開（URLにパラメータ差し込み可）。http/https のみ・最大3。
    const buttons = (Array.isArray(data.buttons) ? data.buttons : [])
      .map((b: { label?: string; url?: string }) => ({ label: fill((b?.label ?? '').trim(), vars), url: fill((b?.url ?? '').trim(), vars) }))
      .filter((b: TemplateButton) => b.label && /^https?:\/\//i.test(b.url))
      .slice(0, 3)
    if (!body && attachments.length === 0 && buttons.length === 0) return null
    return { body, attachments, buttons }
  } catch {
    return null
  }
}
