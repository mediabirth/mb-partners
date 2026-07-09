'use client'
// 案件ボードのⓘ本体：ステータス×3面マトリクス（読み取り専用）。PageGuide の children として描画。
// ★見た目・内容は従来の StatusMatrixModal を不変で移送（外殻＝モーダルは PageGuide が担う）。
import { DEAL_STATUS } from '@/lib/status'
import { statusTranslation, projectLaneTranslation, statusEntryEffects, DEAL_STATUS_KEYS } from '@/lib/status-effects'

export default function StatusMatrixBody() {
  return (
    <div style={{ marginTop: 14, border: '0.5px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.7rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg2)' }}>
            {['運営', 'パートナー', 'デリバリー', '通知メール'].map(h => (
              <th key={h} style={{ textAlign: 'left', fontWeight: 500, fontSize: '.6rem', color: 'var(--muted2)', padding: '8px 12px', borderBottom: '0.5px solid var(--line)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DEAL_STATUS_KEYS.map(k => {
            const t = statusTranslation(k)
            const eff = statusEntryEffects(k)
            return (
              <tr key={k}>
                <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: `var(--st-${DEAL_STATUS[k]?.tone ?? 'neutral'})`, flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>{t.ops}</span>
                  </span>
                </td>
                <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top' }}>{t.partner}</td>
                <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top' }}>{t.vendor}</td>
                <td style={{ padding: '9px 12px', borderBottom: '0.5px solid var(--line)', fontWeight: 400, verticalAlign: 'top', lineHeight: 1.6 }}>
                  {eff.mails.length === 0
                    ? <span style={{ color: 'var(--muted)' }}>—</span>
                    : eff.mails.map(m => <div key={m.key}>{m.audience}宛「{m.name}」</div>)}
                  {eff.mailNote && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>（{eff.mailNote}）</div>}
                  {eff.opsNotify && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>運営へ通知</div>}
                  {eff.extra && <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{eff.extra}</div>}
                </td>
              </tr>
            )
          })}
          {(() => {
            const pt = projectLaneTranslation()
            return (
              <tr>
                <td style={{ padding: '9px 12px', verticalAlign: 'top' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--st-neutral)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>プロジェクト状態</span>
                  </span>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted)', marginTop: 2 }}>進行中／納品済み</div>
                </td>
                <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top' }}>{pt.partner}</td>
                <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top' }}>{pt.vendor}</td>
                <td style={{ padding: '9px 12px', fontWeight: 400, verticalAlign: 'top', color: 'var(--muted)' }}>—</td>
              </tr>
            )
          })()}
        </tbody>
      </table>
    </div>
  )
}
