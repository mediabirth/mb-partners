import Button from '@/components/ui/Button'

// 憲法v1：全サーフェス共通の静かな404（ルート集約＝/app・/vendor・/console すべてカバー）。
// 表示のみ・認証/遷移ロジックに非接触。トークン/プリミティブ使用。
export default function NotFound() {
  return (
    <div className="ui-enter" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 28px', background: 'var(--s-1)' }}>
      <div className="en" style={{ fontSize: '.62rem', color: 'var(--t-tertiary)', letterSpacing: '.16em' }}>404</div>
      <h1 style={{ fontSize: 'var(--fs-display)', fontWeight: 500, letterSpacing: '-.02em', color: 'var(--t-primary)', marginTop: 10 }}>ページが見つかりません</h1>
      <p style={{ fontSize: 'var(--fs-body)', color: 'var(--t-secondary)', marginTop: 10, lineHeight: 1.85, maxWidth: 300 }}>お探しのページは移動したか、削除された可能性があります。</p>
      <div style={{ marginTop: 22 }}><Button variant="secondary" size="lg" href="/">ホームへ</Button></div>
    </div>
  )
}
