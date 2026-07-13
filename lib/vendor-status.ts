/**
 * ベンダー語の単一ソース（v2.2）。
 * ベンダー画面ではパートナー語（「成約」「対応中」等）は使わない。
 * 状態語・状態色はここからのみ輸入する（各画面でのローカル再定義は禁止）。
 */
export type VendorSt = { label: string; c: string; bg: string }

/** deal.status → ベンダー語（案件一覧・ホーム）。 */
export const VENDOR_DEAL_ST: Record<string, VendorSt> = {
  received: { label: '受付', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  in_progress: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  confirmed: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  paid: { label: '完了', c: 'var(--green)', bg: 'var(--green-bg)' },
  lost: { label: '終了', c: 'var(--muted2)', bg: 'var(--bg2)' },
}

/** deal.status → ベンダー語（案件詳細。received は着手前＝「準備中」）。 */
export const VENDOR_CASE_ST: Record<string, VendorSt> = {
  received: { label: '準備中', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  in_progress: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  confirmed: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  paid: { label: '完了', c: 'var(--green)', bg: 'var(--green-bg)' },
  lost: { label: '終了', c: 'var(--muted2)', bg: 'var(--bg2)' },
}

/** delivery_assignments.status → ベンダー語（委託提示のライフサイクル。assigned=旧既定値は了承済相当）。 */
export const VENDOR_OFFER_ST: Record<string, VendorSt> = {
  proposed:  { label: '承諾待ち', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  accepted:  { label: '了承済', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  assigned:  { label: '了承済', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  delivered: { label: '納品済み', c: 'var(--green)', bg: 'var(--green-bg)' },
  declined:  { label: '辞退', c: 'var(--muted2)', bg: 'var(--bg2)' },
}

/** expense_claims.status → ベンダー語。 */
export const VENDOR_EXPENSE_ST: Record<string, VendorSt> = {
  submitted: { label: '申請中', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  approved: { label: '承認済', c: 'var(--green)', bg: 'var(--green-bg)' },
  rejected: { label: '却下', c: 'var(--red)', bg: 'var(--red-bg)' },
}

