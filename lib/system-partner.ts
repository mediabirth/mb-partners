/**
 * 直営業基盤：MB直営（is_system）システムパートナーの参照ヘルパー。
 * システムパートナーは「直営業案件の partner_id NOT NULL を満たすための内部用」。
 * 支払対象外（close_month は is_system を除外）・全パートナーUI/集計から非表示。
 */
type AdminClient = { from: (t: string) => any }

export const SYSTEM_PARTNER_CODE = 'MBHOUSE'
export const SYSTEM_PARTNER_EMAIL = 'mb-house@mb-system.internal'
export const SYSTEM_PARTNER_NAME = 'MB直営'

/** MB直営パートナーの id を返す（未作成 / is_system列なし(DDL前) は null）。 */
export async function getSystemPartnerId(admin: AdminClient): Promise<string | null> {
  try {
    const { data, error } = await admin.from('partners').select('id').eq('is_system', true).limit(1).maybeSingle()
    if (error) return null
    return (data?.id as string) ?? null
  } catch {
    return null
  }
}
