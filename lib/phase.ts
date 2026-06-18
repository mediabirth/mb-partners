/**
 * F-1 概念モデル：流入経路(intake_type)＋フェーズ(phase)＋プロジェクト実行ステータス(project_status)。
 * phase は純関数で導出（DB列なし）。お金（reward/payout/frozen/lib/pnl）には一切触れない。
 *  - direct（直営業）：常に project（商談を経ない確定プロジェクト）。
 *  - referral_coop（紹介・協力）：成約(confirmed/paid)で project、それ以外は shodan（商談）。
 */
export type Phase = 'shodan' | 'project'
export type IntakeType = 'referral_coop' | 'direct'

export function phaseOf(deal: { intake_type?: string | null; status: string }): Phase {
  const intake = (deal.intake_type ?? 'referral_coop')
  if (intake === 'direct') return 'project'
  return ['confirmed', 'paid'].includes(deal.status) ? 'project' : 'shodan'
}

export const PHASE_LABEL: Record<Phase, string> = { shodan: '商談', project: 'プロジェクト' }
export const PHASE_STYLE: Record<Phase, { c: string; bg: string }> = {
  shodan: { c: 'var(--amber)', bg: 'var(--amber-bg)' },
  project: { c: 'var(--blue)', bg: 'var(--blue-bg)' },
}
export const INTAKE_LABEL: Record<string, string> = { referral_coop: '紹介・協力', direct: '直営業' }

// プロジェクト実行ステータス（未着手 → 進行中 → 確認待ち → 修正対応 → 納品完了 ＋ 保留）
export const PROJECT_STATUSES = ['未着手', '進行中', '確認待ち', '修正対応', '納品完了', '保留'] as const
export const PROJECT_STATUS_STYLE: Record<string, { c: string; bg: string }> = {
  '未着手': { c: 'var(--muted2)', bg: 'var(--bg2)' },
  '進行中': { c: 'var(--blue)', bg: 'var(--blue-bg)' },
  '確認待ち': { c: 'var(--amber)', bg: 'var(--amber-bg)' },
  '修正対応': { c: 'var(--red)', bg: 'var(--red-bg)' },
  '納品完了': { c: 'var(--green)', bg: 'var(--green-bg)' },
  '保留': { c: 'var(--muted2)', bg: 'var(--bg2)' },
}
