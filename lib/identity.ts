/**
 * アイデンティティの単一の門（面をまたぐ profile 上書きの構造的封鎖）。
 *
 * 背景（再発事象）: profiles は auth ユーザー（＝メール）と 1:1。同一メールで APP(partner) と vendor の
 * 両面アカウントを持つと、後から受諾した面の accept 経路が profiles.role/name を上書きし、
 * 先に登録した面のアイデンティティが「消滅」して別人格に入れ替わる事故が起きた（vendor/accept が
 * 既存 partner プロフィールを role='vendor'・name=会社名 に書き換えた）。
 *
 * 不変条件: **accept 経路は既存プロフィールの role を絶対に変更しない**。role は新規作成時のみ確定する。
 * 面ごとの「その面での本人か」は role 単一列ではなく、面ごとの紐づけ（partners.profile_id / deliveries.auth_user_id）
 * で判定する（resolveVendor / getPartnerByUserId）。これにより一つのメールが partner と vendor を安全に兼ねられる。
 *
 * すべての accept 経路（/api/invite/accept・/api/vendor/accept）はここを通し、profiles への role 書込を集中させる。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
// service_role クライアント（createServiceRoleClient の戻り値）。型は supabase-js 由来（eslint の認証封鎖は
// @supabase/ssr の createBrowser/ServerClient を対象とする規則で、型 import は対象外＝ここは適合）。
type Service = SupabaseClient

export type AttachResult = {
  created: boolean          // 新規プロフィールを作ったか
  keptRole: string | null   // 既存プロフィールを保持した場合、その現行 role（＝上書きしなかった）
}

/**
 * auth ユーザーに、その面のプロフィールを付与する。
 * - プロフィール未作成: role/name/nickname を確定して insert（この面が最初の登録＝素性の起点）。
 * - プロフィール既存: **何も変更しない**（role も name も nickname も保全）。
 *   別面（partner↔vendor）のアイデンティティを一切壊さない＝面をまたぐ上書きが「構造的に不可能」。
 *   その面での表示名・本人性は面固有テーブル（partners / deliveries）側で保持する。
 */
export async function attachSurfaceProfile(
  service: Service,
  args: { userId: string; email: string; name: string; role: string; nickname?: string | null; color: string }
): Promise<AttachResult> {
  const { userId, email, name, role, nickname = null, color } = args
  const { data: existing } = await service.from('profiles').select('id, role').eq('id', userId).maybeSingle()
  if (!existing) {
    const { error } = await service.from('profiles').insert({ id: userId, name, role, email, color, nickname })
    if (error) throw new Error('profiles insert failed: ' + error.message)
    return { created: true, keptRole: null }
  }
  // 既存プロフィールは保全（別面のアイデンティティを壊さない）。role/name/nickname いずれも上書きしない。
  return { created: false, keptRole: (existing.role as string) ?? null }
}
