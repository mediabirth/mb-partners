'use client'
import Button from '@/components/ui/Button'

// 憲法v1：クライアントエラー境界（スタックは出さない・寄り添う文言）。reset() で再試行。
// 認証/遷移ロジックに非接触＝表示のみ。
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="ui-enter" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 28px', background: 'var(--s-1)' }}>
      <div className="en" style={{ fontSize: '.62rem', color: 'var(--t-tertiary)', letterSpacing: '.16em' }}>ERROR</div>
      <h1 style={{ fontSize: 'var(--fs-h1)', fontWeight: 600, letterSpacing: '-.015em', color: 'var(--t-primary)', marginTop: 10 }}>一時的な問題が発生しました</h1>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--t-secondary)', marginTop: 10, lineHeight: 1.85, maxWidth: 320 }}>お手数ですが、再読み込みをお試しください。問題が続く場合は、時間をおいて再度アクセスしてください。</p>
      <div style={{ marginTop: 22 }}><Button variant="primary" size="lg" onClick={() => reset()}>再読み込み</Button></div>
    </div>
  )
}
