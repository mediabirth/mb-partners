import type { Metadata, Viewport } from 'next'
import { Inter, Zen_Kaku_Gothic_New } from 'next/font/google'
import './globals.css'
import InstallHint from '@/components/InstallHint'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-zen',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://mb-partners.app'),
  title: 'MB Partners',
  description: '「つながり」が、資産になる。株式会社Media Birth のパートナープログラム「MB Partners」。',
  applicationName: 'MB Partners',
  openGraph: {
    title: 'MB Partners',
    description: '「つながり」が、資産になる。ご紹介いただくだけ。あとは、私たちが。',
    type: 'website',
    locale: 'ja_JP',
    siteName: 'MB Partners',
    url: 'https://mb-partners.app',
    images: [{ url: '/og.png', width: 2400, height: 1260, alt: 'MB Partners — 「つながり」が、資産になる。' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MB Partners',
    description: '「つながり」が、資産になる。ご紹介いただくだけ。あとは、私たちが。',
    images: ['/og.png'],
  },
  // PWA: アイコン + apple-touch-icon
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  // ③ iOS: ホーム画面追加で全画面・ステータスバー・タイトル
  appleWebApp: {
    capable: true,
    title: 'MB Partners',
    statusBarStyle: 'default',
  },
  // 旧iOS全画面用に明示（Next は mobile-web-app-capable を出すため apple- 版も併記）
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#4733E6',
  // H: iOS Safari の動的下部バー対策。env(safe-area-inset-*) を有効化（cover必須）。
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${zenKaku.variable}`}>
      <body>
        {/* PWA起動スプラッシュ：初回ロード/リロード時のみ。SYNAPSE紋章の§9低振幅パルス（system+SVG＝webフォント非依存）。
            critical inline CSS で外部CSS読込前から表示→hydration完了(load)で200msフェードアウト→DOMから除去。
            SPA内遷移ではroot layoutは再描画されず＝再表示されない。reduced-motionで静止。 */}
        <style dangerouslySetInnerHTML={{ __html: `
#mbp-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#F7F8FA;transition:opacity .2s ease;font-family:system-ui,-apple-system,sans-serif}
#mbp-splash.is-hide{opacity:0;pointer-events:none}
#mbp-splash svg{width:84px;height:84px}
#mbp-splash .mbp-spl-lbl{font-size:11px;font-weight:700;letter-spacing:.16em;color:#94A3B8;text-transform:uppercase}
.mbp-spl-node{transform-box:fill-box;transform-origin:center;animation:mbpSplNode 2.8s ease-in-out infinite}
.mbp-spl-link{animation:mbpSplLink 3.2s ease-in-out infinite}
@keyframes mbpSplNode{0%,100%{opacity:.55;transform:scale(.82)}50%{opacity:1;transform:scale(1)}}
@keyframes mbpSplLink{0%,100%{opacity:.25}50%{opacity:.7}}
@media (prefers-reduced-motion:reduce){#mbp-splash{transition:none}.mbp-spl-node,.mbp-spl-link{animation:none!important;opacity:1!important;transform:none!important}}
        ` }} />
        <div id="mbp-splash" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <g stroke="#4733E6" strokeWidth="1.1" strokeLinecap="round">
              <line className="mbp-spl-link" style={{ animationDelay: '.2s' }} x1="24" y1="24" x2="9" y2="13" />
              <line className="mbp-spl-link" style={{ animationDelay: '.55s' }} x1="24" y1="24" x2="40" y2="11" />
              <line className="mbp-spl-link" style={{ animationDelay: '.9s' }} x1="24" y1="24" x2="38" y2="37" />
              <line className="mbp-spl-link" style={{ animationDelay: '1.25s' }} x1="24" y1="24" x2="10" y2="36" />
              <line className="mbp-spl-link" style={{ animationDelay: '1.6s' }} x1="24" y1="24" x2="24" y2="6" />
            </g>
            <circle className="mbp-spl-node" style={{ animationDelay: '0s' }} cx="24" cy="24" r="4.2" fill="#4733E6" />
            <circle className="mbp-spl-node" style={{ animationDelay: '.35s' }} cx="9" cy="13" r="2.6" fill="#3D2BCC" />
            <circle className="mbp-spl-node" style={{ animationDelay: '.7s' }} cx="40" cy="11" r="2.2" fill="#7F77DD" />
            <circle className="mbp-spl-node" style={{ animationDelay: '1.05s' }} cx="38" cy="37" r="2.8" fill="#4733E6" />
            <circle className="mbp-spl-node" style={{ animationDelay: '1.4s' }} cx="10" cy="36" r="2.2" fill="#3D2BCC" />
            <circle className="mbp-spl-node" style={{ animationDelay: '1.75s' }} cx="24" cy="6" r="2" fill="#7F77DD" />
          </svg>
          <span className="mbp-spl-lbl">MB Partners</span>
        </div>
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
  function hide(){ var s=document.getElementById('mbp-splash'); if(!s)return; s.classList.add('is-hide'); setTimeout(function(){ if(s&&s.parentNode) s.parentNode.removeChild(s); }, 240); }
  if (document.readyState === 'complete') { setTimeout(hide, 60); }
  else { window.addEventListener('load', function(){ setTimeout(hide, 60); }); }
})();
        ` }} />
        {children}
        <InstallHint />
        <script dangerouslySetInnerHTML={{ __html: `
if ('serviceWorker' in navigator) {
  // 体感: 新デプロイでSWが切り替わっても操作中は即リロードしない（画面中断を排除）。
  // タブが背面(hidden)になった/離脱する時にだけ新版へリロード＝ユーザーは中断されず、戻ると最新。
  // HTMLは常にno-store(network)で取得＝データは常に最新なので、JSの反映を次の離脱まで遅延しても金銭/状態はstaleにならない。
  var _mbpPendingReload = false, _mbpReloading = false;
  function _mbpDoReload() { if (_mbpReloading) return; _mbpReloading = true; window.location.reload(); }
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (document.visibilityState === 'hidden') { _mbpDoReload(); } else { _mbpPendingReload = true; }
  });
  document.addEventListener('visibilitychange', function() {
    if (_mbpPendingReload && document.visibilityState === 'hidden') _mbpDoReload();
  });
  window.addEventListener('pagehide', function() { if (_mbpPendingReload) _mbpDoReload(); });
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(e) {
      console.warn('[SW] registration failed:', e);
    });
  });
}
        ` }} />
      </body>
    </html>
  )
}
