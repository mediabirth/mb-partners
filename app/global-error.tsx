'use client'

// 憲法v1：ルートレイアウト自体が失敗した場合のフォールバック。
// ★globals.css(ルートlayout由来)は読み込まれないため、トークン値を直値で指定（憲法§1-6の実値）。
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#F7F8FA', color: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px 28px', maxWidth: 340 }}>
          <div style={{ fontSize: '.62rem', color: '#94A3B8', letterSpacing: '.16em', fontWeight: 700 }}>ERROR</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-.015em', margin: '10px 0 0' }}>一時的な問題が発生しました</h1>
          <p style={{ fontSize: '.875rem', color: '#334155', lineHeight: 1.85, marginTop: 10 }}>お手数ですが、再読み込みをお試しください。</p>
          <button onClick={() => reset()} style={{ marginTop: 22, background: '#4733E6', color: '#fff', border: 'none', borderRadius: 8, padding: '13px 22px', fontWeight: 700, fontSize: '.86rem', cursor: 'pointer' }}>再読み込み</button>
        </div>
      </body>
    </html>
  )
}
