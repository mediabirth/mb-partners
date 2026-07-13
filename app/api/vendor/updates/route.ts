/**
 * ベンダー純化P1: 進捗メモ/課題フラグ（PM残滓）はベンダー面から撤去（vendor-redesign.md §1 V6）。
 * データ（delivery_updates）は残置・読み取りは運営側。入口のみ閉鎖（405）。
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'この操作は終了しました' }, { status: 405 })
}
