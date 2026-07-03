/**
 * 招待URL等「パートナーAPP/ベンダー面へ着地するリンク」のorigin決定。
 *
 * console.mb-partners.app で発行した招待URLをそのまま使うと、受諾ページが console ホストで開かれ、
 * signIn の cookie が mb-auth-console 名前空間に書かれる（surfaceFor は host 優先）。その後 /app へ
 * 遷移すると apex の mb-auth-app が要求され、必ずログインへ落ちる（整合性プログラム A5 根因）。
 * → 本番系ホストでは apex 固定。localhost / preview は元の origin を維持（パスで surface=app になる）。
 */
const APEX = 'https://mb-partners.app'

export function partnerFacingOrigin(origin: string | null | undefined): string {
  if (!origin) return APEX
  try {
    const h = new URL(origin).host.toLowerCase()
    if (h === 'mb-partners.app' || h.endsWith('.mb-partners.app')) return APEX
    return origin
  } catch {
    return APEX
  }
}

/** リクエストヘッダから origin を復元（x-forwarded-proto + host → req.url フォールバック） */
export function requestOrigin(req: { headers: { get(name: string): string | null }; url: string }): string {
  const proto = req.headers.get('x-forwarded-proto')
  const host = req.headers.get('host')
  if (proto && host) return `${proto}://${host}`
  return new URL(req.url).origin
}
