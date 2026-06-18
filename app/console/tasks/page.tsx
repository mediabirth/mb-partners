import { redirect } from 'next/navigation'
// 協力タスクはサービスマスタの各サービス編集「対応範囲」に統合。旧URLは互換のためリダイレクト。
export default function TasksRedirect() {
  redirect('/console/services')
}
