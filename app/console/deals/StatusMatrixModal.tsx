'use client'
// 通水P2「束削減」: ステータス×3面マトリクス（読み取り専用の参照モーダル）。ⓘ押下時のみ dynamic 取得＝初期ロードから分離。
import Link from 'next/link'
import { DEAL_STATUS } from '@/lib/status'
import { statusTranslation, projectLaneTranslation, statusEntryEffects, DEAL_STATUS_KEYS } from '@/lib/status-effects'

export default function StatusMatrixModal({ onClose }: { onClose: () => void }) {
  return (
        <>
          <div onClick={() => onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', zIndex: 90 }} />
          <div className="modal-pop" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 680, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 16, zIndex: 95, boxShadow: '0 24px 60px rgba(14,14,20,.22)', padding: '22px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.92rem' }}>ステータスと3面の表示</b>
              <button onClick={() => onClose()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>
              案件ステータスごとに、パートナー・デリバリーへの表示と自動送信メールが決まります
            </p>
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
                  {/* project_status の注記行（3面写像は projectLaneTranslation＝confirmed の翻訳に固定） */}
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
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 12, lineHeight: 1.7 }}>
              プロジェクト状態（進行中／納品済み）は社内管理で、パートナー・デリバリーには表示されません
            </p>
            <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.7 }}>
              メール文面の編集は <Link href="/console/settings/mail" style={{ color: 'var(--c-blue)', textDecoration: 'underline', textUnderlineOffset: 3 }}>設定→メール</Link>
            </p>
          </div>
        </>
  )
}
