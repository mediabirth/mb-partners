/**
 * F-2：ステータス語彙の単一の真実。3サーフェスで重複していたラベル/色マップをここへ集約。
 * 各リゾルバは StatusPill にスプレッドできる { tone, children } を返す（色は意味色トークン経由）。
 * ★純粋なプレゼンテーション。ロジック/お金/RLS には一切関与しない（見た目の一貫性のためだけの層）。
 */
import type { Tone } from '@/components/ui/StatusPill'
import { PROJECT_STATUS_STYLE, INTAKE_LABEL } from '@/lib/phase'

type Pill = { tone: Tone; label: string }

// ── 案件ステータス（受付→対応中→成約→支払済／不成立）。app/console/vendor 共通 ──
export const DEAL_STATUS: Record<string, Pill> = {
  received:    { tone: 'warn',     label: '受付' },
  in_progress: { tone: 'progress', label: '対応中' },
  confirmed:   { tone: 'success',  label: '成約' },
  paid:        { tone: 'neutral',  label: '支払済' },
  lost:        { tone: 'neutral',  label: '不成立' },
}
export function dealStatus(status: string): { tone: Tone; children: string } {
  const p = DEAL_STATUS[status] ?? { tone: 'neutral' as Tone, label: status }
  return { tone: p.tone, children: p.label }
}

// ── 支払/報酬の状態（未払い/支払済/凍結）──
export const PAYMENT_STATE: Record<string, Pill> = {
  unpaid: { tone: 'warn',     label: '未払い' },
  paid:   { tone: 'success',  label: '支払済' },
  frozen: { tone: 'progress', label: '凍結' },
}
export function paymentState(status: string): { tone: Tone; children: string } {
  const p = PAYMENT_STATE[status] ?? { tone: 'neutral' as Tone, label: status }
  return { tone: p.tone, children: p.label }
}

// ── パートナー在籍状態（有効/承認待ち/停止）──
export const PARTNER_STATUS: Record<string, Pill> = {
  active:    { tone: 'success', label: '稼働中' },
  pending:   { tone: 'warn',    label: '招待済・未稼働' },
  suspended: { tone: 'danger',  label: '停止' },
}
export function partnerStatus(status: string): { tone: Tone; children: string } {
  const p = PARTNER_STATUS[status] ?? { tone: 'neutral' as Tone, label: status }
  return { tone: p.tone, children: p.label }
}

// ── 経費承認（申請中/承認済/却下）──
export const EXPENSE_STATUS: Record<string, Pill> = {
  submitted: { tone: 'warn',    label: '申請中' },
  approved:  { tone: 'success', label: '承認済' },
  rejected:  { tone: 'danger',  label: '却下' },
}
export function expenseStatus(status: string): { tone: Tone; children: string } {
  const p = EXPENSE_STATUS[status] ?? { tone: 'warn' as Tone, label: status }
  return { tone: p.tone, children: p.label }
}

// ── 問い合わせ（未返信/返信済/クローズ）──
export const INQUIRY_STATUS: Record<string, Pill> = {
  open:    { tone: 'warn',     label: '未返信' },
  replied: { tone: 'progress', label: '返信済' },
  closed:  { tone: 'neutral',  label: 'クローズ' },
}
export function inquiryStatus(status: string): { tone: Tone; children: string } {
  const p = INQUIRY_STATUS[status] ?? { tone: 'neutral' as Tone, label: status }
  return { tone: p.tone, children: p.label }
}

// ── プロジェクト実行ステータス（phase.ts の色定義を tone に対応づけ）──
const PROJECT_TONE: Record<string, Tone> = {
  '未着手': 'neutral', '進行中': 'progress', '確認待ち': 'warn',
  '修正対応': 'danger', '納品完了': 'success', '保留': 'neutral',
}
export function projectStatus(status: string | null | undefined): { tone: Tone; children: string } | null {
  if (!status || !(status in PROJECT_STATUS_STYLE)) return null
  return { tone: PROJECT_TONE[status] ?? 'neutral', children: status }
}

// ── パートナー種別（役職バッジ：リファラル/フロンティア/デリバリー）。同じUI言語で識別 ──
export const PARTNER_KIND: Record<string, Pill> = {
  referral: { tone: 'progress', label: 'リファラル' },
  frontier: { tone: 'success',  label: 'フロンティア' },
  delivery: { tone: 'warn',     label: 'デリバリー' },
}
export function partnerKind(kind: string): { tone: Tone; children: string } {
  const p = PARTNER_KIND[kind] ?? { tone: 'neutral' as Tone, label: kind }
  return { tone: p.tone, children: p.label }
}

// ── 流入経路（紹介・協力/直営業）──
export function intakeType(intake: string | null | undefined): { tone: Tone; children: string } {
  const key = intake ?? 'referral_coop'
  return { tone: key === 'direct' ? 'neutral' : 'progress', children: INTAKE_LABEL[key] ?? key }
}

// ── パートナー面の表示ラベル（操縦席・翻訳レイヤーの写像元）──
// パートナーAPP（案件一覧/詳細/報酬）が実際に表示する語は DEAL_STATUS と同一（4語＋不成立）。
// 旧 Wave2 の PARTNER_STAGE（MB対応中/見送り等）はどの画面にも描画されない死語彙だったため採用しない。
export function partnerFacingLabel(status: string): string {
  return DEAL_STATUS[status]?.label ?? status
}
