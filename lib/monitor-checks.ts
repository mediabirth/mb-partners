/**
 * 自己監視チェックの表示メタ（コンソール「監視」タブ用・表示のみ）。
 * 実チェックの正典は app/api/monitor/route.ts（キーはそちらと1対1）。項目を増減したら本表も追随すること。
 */
export const TIER_INFO: Record<string, { label: string; cadence: string; desc: string }> = {
  t1: { label: 'Tier1', cadence: '15分毎', desc: '公開面の到達性＋DB到達' },
  t2: { label: 'Tier2', cadence: '1時間毎', desc: 'カレンダー連携・メール基盤の生死' },
  t3: { label: 'Tier3', cadence: '日次（朝7時 JST）', desc: '認証スモーク・money整合・乗っ取りガード歩哨' },
}

export const CHECK_LABELS: Record<string, string> = {
  't1.app_login_redirect': 'APP 未認証リダイレクト',
  't1.console_login_redirect': 'コンソール 未認証リダイレクト',
  't1.vendor_login_redirect': 'ベンダー 未認証リダイレクト',
  't1.webhook_unsigned_401': 'LINE Webhook 無署名拒否',
  't1.partners_200': 'パートナー募集LP',
  't1.referral_page_200': '紹介ページ /r/',
  't1.db_reachable': 'DB 到達性',
  't2.calendar_health': 'Googleカレンダー連携',
  't2.mail_provider': 'メール送信基盤（Resend）',
  't3.auth_read_smoke': '認証 read-only スモーク',
  't3.fee_snapshot_null': 'fee_snapshot 凍結漏れ',
  't3.fee_integrity': 'サプライヤー請求の自己整合',
  't3.unbilled_stale': 'サプライヤー請求の未請求滞留',
  't3.invite_hijack_guard': '招待の乗っ取りガード',
}

export function tierOf(key: string): 't1' | 't2' | 't3' | null {
  const p = key.split('.')[0]
  return p === 't1' || p === 't2' || p === 't3' ? p : null
}

/** 監視自身の死の閾値（最終実行がこれより古ければダッシュボードに警告バナー）。 */
export const MONITOR_STALE_HOURS = 24
