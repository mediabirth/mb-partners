import { redirect } from 'next/navigation'
// MBメンバー管理は 設定>管理者管理 に統合。旧URLは互換のためリダイレクト。
export default function MembersRedirect() {
  redirect('/console/settings')
}
