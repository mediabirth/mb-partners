/**
 * メッセージ司令塔 Phase3-C：自動メッセージ文面の templates 解決（読み取り専用・additive）。
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
