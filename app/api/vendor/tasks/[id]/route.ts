/**
 * ベンダー純化P1: タスク完了チェック（PM残滓）はベンダー面から撤去（vendor-redesign.md §1 V6）。
 * データ（delivery_tasks）は残置・読み取りは運営側。入口のみ閉鎖（405）。
 */
import { NextResponse } from 'next/server'

export async function PATCH() {
  return NextResponse.json({ error: 'この操作は終了しました' }, { status: 405 })
}
