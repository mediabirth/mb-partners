'use client'

export type ActionPendingState = 'idle' | 'pending' | 'success'

/**
 * EXP-1 共通アクション表示。確定を先取りせず、サーバ応答までは pending、応答後だけ success を示す。
 * アニメーションは一時的な transform / opacity のみ。reduced-motion では即時表示へ退避する。
 */
export default function ActionPending({
  state,
  idleLabel,
  pendingLabel,
  successLabel = '完了しました',
  count = 1,
}: {
  state: ActionPendingState
  idleLabel: string
  pendingLabel: string
  successLabel?: string
  count?: number
}) {
  const steps = Math.max(1, Math.min(20, Math.round(count)))
  return (
    <span className={`action-pending action-pending--${state}`} aria-live="polite" data-action-state={state}>
      <style>{`
        .action-pending{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:20px;white-space:nowrap}
        .action-pending__spinner{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:action-spin .7s linear infinite;flex:none}
        .action-pending__check{width:18px;height:18px;display:inline-grid;place-items:center;border-radius:50%;background:currentColor;animation:action-pop .42s cubic-bezier(.2,1.45,.45,1);flex:none}
        .action-pending__check svg{width:12px;height:12px;color:#fff}
        .action-pending__progress{display:flex;gap:3px;align-items:center;margin-left:2px}
        .action-pending__step{width:12px;height:3px;border-radius:999px;background:currentColor;opacity:.2;transform:scaleX(.35);transform-origin:left;animation:action-step .52s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(var(--action-i) * 90ms)}
        @keyframes action-spin{to{transform:rotate(360deg)}}
        @keyframes action-step{to{opacity:.78;transform:scaleX(1)}}
        @keyframes action-pop{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}
        @media(prefers-reduced-motion:reduce){.action-pending *{animation:none!important;transition:none!important}.action-pending__step{opacity:.78;transform:none}}
      `}</style>
      {state === 'pending' && <span className="action-pending__spinner" aria-hidden />}
      {state === 'success' && (
        <span className="action-pending__check" aria-hidden>
          <svg viewBox="0 0 16 16" fill="none"><path d="m3.5 8.2 2.7 2.7 6.1-6.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}
      <span>{state === 'pending' ? pendingLabel : state === 'success' ? successLabel : idleLabel}</span>
      {state === 'pending' && steps > 1 && (
        <span className="action-pending__progress" role="progressbar" aria-label={`${steps}件を登録中`}>
          {Array.from({ length: steps }, (_, index) => <span key={index} className="action-pending__step" style={{ ['--action-i' as string]: index }} />)}
        </span>
      )}
    </span>
  )
}
