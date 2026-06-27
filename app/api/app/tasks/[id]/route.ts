/**
 * PATCH /api/app/tasks/[id]
 * ★対応範囲チェックの操作主体を管理側（コンソール）へ移管。
 *   パートナーからの done 書き込みは受け付けない（自己申告で報酬ゲートを開けない整合性のため）。
 *   表示（読み取り）はパートナー案件ページで維持。書き込みは /api/console/deals/[id]/tasks（管理側）のみ。
 * money/④b/requiredTasksDone・確定ゲート・レート計算は一切触れない（done を書く主体の変更のみ）。
 */
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(_req: NextRequest) {
  // パートナーからの対応範囲チェック更新は無効化（403）。書き込みは管理側コンソールに集約。
  return NextResponse.json({ error: '対応状況は運営が確認して更新します' }, { status: 403 })
}
