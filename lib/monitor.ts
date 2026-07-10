/**
 * 自己監視（synthetic monitoring）の状態機械＋発報。
 * 閾値＝2回連続失敗で発報（フラッピング防止）、復旧で1通。best-effort（例外は投げない）。
 * 発報文は copy-guideline 準拠：「何が・どこで・次に何をすべきか」を1画面で。運営Slackのみ（実ユーザー送信ゼロ）。
 */
import { sendSlack } from '@/lib/notify'

type Admin = { from: (t: string) => any }

export type CheckResult = {
  key: string
  label: string
  ok: boolean
  detail?: string   // 何が（症状）
  where?: string    // どこで（URL/コンポーネント）
  next?: string     // 次に何をすべきか
}

export function jstNow(): string {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** 1チェックの結果を記録し、2回連続失敗で発報／復旧で1通。返り値＝発報有無。 */
export async function recordCheck(admin: Admin, r: CheckResult): Promise<{ key: string; ok: boolean; alerted: boolean; recovered: boolean; streak: number }> {
  let prevStreak = 0, prevAlerting = false
  try {
    const { data: st } = await admin.from('monitor_state').select('fail_streak, alerting').eq('check_key', r.key).maybeSingle()
    prevStreak = st?.fail_streak ?? 0
    prevAlerting = st?.alerting ?? false
  } catch { /* state未取得でも継続 */ }
  const now = new Date().toISOString()

  if (r.ok) {
    let recovered = false
    if (prevAlerting) {
      await sendSlack(`🟢 MB Partners 監視｜*${r.label}* 復旧しました（${jstNow()} JST）`).catch(() => {})
      recovered = true
    }
    try { await admin.from('monitor_state').upsert({ check_key: r.key, fail_streak: 0, alerting: false, last_ok: now, last_error: null, updated_at: now }) } catch {}
    return { key: r.key, ok: true, alerted: false, recovered, streak: 0 }
  }

  const streak = prevStreak + 1
  let alerting = prevAlerting, alerted = false
  if (streak >= 2 && !prevAlerting) {
    await sendSlack(
      `🔴 MB Partners 監視｜*${r.label}* が異常です\n` +
      `・何が：${r.detail ?? '応答が期待と異なります'}\n` +
      `・どこで：${r.where ?? '—'}\n` +
      `・次に：${r.next ?? '運用で状態を確認してください'}\n` +
      `（2回連続で検知・${jstNow()} JST）`,
    ).catch(() => {})
    alerting = true; alerted = true
  }
  try { await admin.from('monitor_state').upsert({ check_key: r.key, fail_streak: streak, alerting, last_error: (r.detail ?? '').slice(0, 500), updated_at: now }) } catch {}
  return { key: r.key, ok: false, alerted, recovered: false, streak }
}

/** dead-man 用ハートビート（監視自身の死を検知するため、日次で「稼働中」を1行）。 */
export async function heartbeat(text: string): Promise<void> {
  await sendSlack(text).catch(() => {})
}
