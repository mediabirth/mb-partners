'use client'
/**
 * パートナー下層ページ共通シェル（/partners/guide・/rewards・/faq）。
 * LPと同じ世界観（明るいグラデ＋グラス＋光のネットワーク＋モーション）を共有。scene.tsx を使い全ページに動きを付与。
 */
import { useRef, type ReactNode } from 'react'
import { useNetwork, useInteractions } from './scene'

const LOGO = (
  <svg viewBox="0 0 48 48" fill="none" aria-hidden><g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" /></svg>
)

export function SubShell({ kicker, title, lead, children }: { kicker: string; title: string; lead?: string; children: ReactNode }) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  useNetwork(sceneRef)
  useInteractions(progRef, glowRef)
  return (
    <main className="sp">
      <style>{SP_CSS}</style>
      <div className="sp-progress" ref={progRef} aria-hidden />
      <div className="sp-glow" ref={glowRef} aria-hidden />
      <div className="sp-field" aria-hidden />
      <div className="sp-scene" ref={sceneRef} aria-hidden />
      <header className="sp-hd">
        <a className="sp-logo" href="/partners" aria-label="MB Partners">{LOGO}<b>MB<span> Partners</span></b></a>
        <a className="sp-login" href="/app">ログイン</a>
      </header>
      <div className="sp-content">
        <div className="sp-hero">
          <a className="sp-back" href="/partners"><span>←</span> パートナー募集へ</a>
          <span className="sp-kicker"><i />{kicker}</span>
          <h1 className="sp-h1">{title}</h1>
          {lead && <p className="sp-lead">{lead}</p>}
        </div>
        {children}
        <footer className="sp-footer">
          <a className="sp-cta" href="/partners#apply">パートナーに応募する<span className="sp-arrow"> →</span></a>
          <nav className="sp-foot-nav">
            <a href="/partners/guide">はじめてガイド</a>
            <a href="/partners/rewards">報酬について</a>
            <a href="/partners/faq">よくある質問</a>
          </nav>
          <span className="sp-foot-meta">株式会社Media Birth ・ <a href="/legal/privacy">プライバシーポリシー</a></span>
        </footer>
      </div>
    </main>
  )
}

export const SP_CSS = `
.sp{--ink:#1a1830;--ink2:#54506e;--mut:#9a95b0;--line:rgba(26,24,48,.09);--indigo:#5646e6;--violet:#8b5cf6;--teal:#15917e;--gold:#f2971b;
  color:var(--ink);font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;position:relative;min-height:100vh;}
.sp *{box-sizing:border-box;margin:0;}
.sp-field{position:fixed;inset:0;z-index:0;background:
  radial-gradient(58% 46% at 14% 4%,#efeaff 0%,rgba(239,234,255,0) 60%),
  radial-gradient(52% 42% at 92% 6%,#eae4ff 0%,rgba(234,228,255,0) 58%),
  radial-gradient(60% 55% at 78% 96%,#fff1e6 0%,rgba(255,241,230,0) 60%),
  linear-gradient(180deg,#fbfaff,#f5f3ff);}
.sp-scene{position:fixed;inset:0;z-index:1;pointer-events:none;}
.sp-progress{position:fixed;top:0;left:0;right:0;height:3px;transform:scaleX(0);transform-origin:left;background:linear-gradient(90deg,#5646e6,#8b5cf6,#f2971b);z-index:70;will-change:transform;}
.sp-glow{position:fixed;top:0;left:0;width:560px;height:560px;margin:-280px;border-radius:50%;background:radial-gradient(circle,rgba(124,108,240,.16),rgba(124,108,240,0) 66%);pointer-events:none;z-index:1;will-change:transform;}
@keyframes spfloaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes spup{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.sp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:15px 28px;background:rgba(251,250,255,.66);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);box-shadow:0 1px 0 var(--line);}
.sp-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);} .sp-logo svg{height:27px;width:27px;display:block;overflow:visible;}
.sp-logo svg circle,.sp-logo svg rect{transition:transform .4s cubic-bezier(.34,1.56,.64,1);transform-box:fill-box;transform-origin:center;}
.sp-logo svg g{transition:opacity .5s ease;animation:splink 4.4s ease-in-out infinite;}
.sp-logo:hover svg circle,.sp-logo:hover svg rect{transform:scale(1.14);} .sp-logo:hover svg g{opacity:.8!important;}
.sp-logo svg rect:nth-of-type(1){animation:sptwinkle 3.4s ease-in-out infinite;animation-delay:0s;}
.sp-logo svg circle:nth-of-type(1){animation:sptwinkle 3.4s ease-in-out infinite;animation-delay:.6s;}
.sp-logo svg rect:nth-of-type(2){animation:sptwinkle 3.4s ease-in-out infinite;animation-delay:1.2s;}
.sp-logo svg circle:nth-of-type(2){animation:sptwinkle 3.4s ease-in-out infinite;animation-delay:1.8s;}
.sp-logo svg circle:nth-of-type(3){animation:sptwinkle 3.4s ease-in-out infinite;animation-delay:2.4s;}
@keyframes sptwinkle{0%,100%{opacity:.6}16%{opacity:1}}
@keyframes splink{0%,100%{opacity:.32}50%{opacity:.58}}
@media (prefers-reduced-motion:reduce){.sp-logo svg *{animation:none!important}}
.sp-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .sp-logo b span{color:var(--indigo);}
.sp-login{display:inline-flex;align-items:center;height:38px;padding:0 20px;border-radius:999px;border:1.4px solid rgba(86,70,230,.32);color:var(--indigo);background:rgba(255,255,255,.5);text-decoration:none;font-size:.82rem;font-weight:700;transition:background .18s,color .18s,transform .18s;}
.sp-login:hover{background:var(--indigo);border-color:var(--indigo);color:#fff;transform:translateY(-1px);}
.sp-content{position:relative;z-index:2;max-width:820px;margin:0 auto;padding:0 24px 40px;}
.sp-hero{padding:130px 0 44px;}
.sp-hero>*{animation:spup .7s cubic-bezier(.22,1,.36,1) both;}
.sp-hero>*:nth-child(2){animation-delay:.06s} .sp-hero>*:nth-child(3){animation-delay:.12s} .sp-hero>*:nth-child(4){animation-delay:.18s}
.sp-back{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ink2);text-decoration:none;transition:gap .2s,color .18s;} .sp-back:hover{color:var(--indigo);gap:11px;} .sp-back span{transition:transform .2s;} .sp-back:hover span{transform:translateX(-3px);}
.sp-kicker{display:flex;align-items:center;gap:9px;margin-top:24px;font-size:.72rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--indigo);}
.sp-kicker i{width:6px;height:6px;border-radius:50%;background:var(--indigo);box-shadow:0 0 0 4px rgba(86,70,230,.14);animation:sppulse 2.4s ease-in-out infinite;}
.sp-h1{margin-top:16px;font-size:clamp(2.1rem,5vw,3.2rem);font-weight:800;line-height:1.18;letter-spacing:-.04em;color:var(--ink);text-wrap:balance;}
.sp-lead{margin-top:18px;font-size:clamp(1rem,2vw,1.15rem);line-height:1.85;color:var(--ink2);max-width:34em;}
.sp-h2{font-size:clamp(1.4rem,3vw,1.85rem);font-weight:800;letter-spacing:-.03em;color:var(--ink);margin:56px 0 22px;}
.sp-card{background:rgba(255,255,255,.66);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);border-radius:20px;box-shadow:0 12px 40px rgba(40,30,80,.07);padding:clamp(22px,3.4vw,32px);transition:transform .2s,box-shadow .2s;animation:spup .7s cubic-bezier(.22,1,.36,1) both;}
.sp-card:hover{transform:translateY(-4px);box-shadow:0 24px 56px rgba(86,70,230,.12);}
.sp-timeline .sp-card:nth-child(2){animation-delay:.08s} .sp-timeline .sp-card:nth-child(3){animation-delay:.16s} .sp-timeline .sp-card:nth-child(4){animation-delay:.24s} .sp-timeline .sp-card:nth-child(5){animation-delay:.32s}
.sp-rwd .sp-card:nth-child(2){animation-delay:.1s} .sp-rwd .sp-card:nth-child(3){animation-delay:.2s}

/* タイムライン（guide） */
.sp-timeline{position:relative;display:flex;flex-direction:column;gap:16px;margin-top:8px;}
.sp-tl{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;}
.sp-tl-num{position:relative;flex-shrink:0;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.05rem;background:linear-gradient(150deg,#8b5cf6,#5646e6);box-shadow:0 12px 30px rgba(86,70,230,.3);animation:spfloaty 5s ease-in-out infinite;}
.sp-tl:nth-child(2) .sp-tl-num{background:linear-gradient(150deg,#3ec6a0,#15917e);box-shadow:0 12px 30px rgba(21,145,126,.28);animation-delay:.6s;}
.sp-tl:nth-child(3) .sp-tl-num{animation-delay:1.2s;}
.sp-tl:nth-child(4) .sp-tl-num{background:linear-gradient(150deg,#ffc24d,#f2971b);box-shadow:0 12px 30px rgba(242,151,27,.3);animation-delay:1.8s;}
.sp-tl:nth-child(5) .sp-tl-num{animation-delay:2.4s;}
.sp-tl-body{padding-top:4px;} .sp-tl-t{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);} .sp-tl-d{margin-top:8px;font-size:.94rem;line-height:1.75;color:var(--ink2);}

/* 報酬詳細（rewards） */
.sp-rwd{display:flex;flex-direction:column;gap:16px;margin-top:8px;}
.sp-rwd-item{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;}
.sp-rwd-badge{flex-shrink:0;width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:var(--rc);background:linear-gradient(150deg,color-mix(in srgb,var(--rc) 16%,#fff),color-mix(in srgb,var(--rc) 6%,#fff));border:1px solid color-mix(in srgb,var(--rc) 18%,transparent);font-weight:800;font-size:.9rem;animation:spfloaty 5s ease-in-out infinite;}
.sp-rwd-item:nth-child(2) .sp-rwd-badge{animation-delay:.6s;} .sp-rwd-item:nth-child(3) .sp-rwd-badge{animation-delay:1.2s;}
.sp-rwd-badge svg{width:42px;height:42px;}
.ri-coin{transform-box:fill-box;transform-origin:center;animation:cointurn 3.6s ease-in-out infinite;}
@keyframes cointurn{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.72)}}
.ri-bar{transform-box:fill-box;transform-origin:bottom;animation:bargrow 2.6s ease-in-out infinite;}
.ri-bar.rb2{animation-delay:.22s;} .ri-bar.rb3{animation-delay:.44s;}
@keyframes bargrow{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.6)}}
.ri-cyc{transform-box:view-box;transform-origin:44px 44px;animation:cspin 6.5s linear infinite;}
@keyframes cspin{to{transform:rotate(360deg)}}
.sp-rwd-t{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);} .sp-rwd-t b{color:var(--rc);}
.sp-rwd-d{margin-top:7px;font-size:.92rem;line-height:1.7;color:var(--ink2);}
.sp-note{margin-top:26px;font-size:.76rem;line-height:1.7;color:var(--mut);background:rgba(86,70,230,.05);border-radius:12px;padding:16px 18px;}

/* FAQ（faq） */
.sp-faq{display:flex;flex-direction:column;gap:12px;margin-top:8px;}
.sp-faq-item{border-radius:16px;background:rgba(255,255,255,.6);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 8px 30px rgba(40,30,80,.06);overflow:hidden;transition:box-shadow .25s;animation:spup .6s cubic-bezier(.22,1,.36,1) both;}
.sp-faq-item.open{box-shadow:0 16px 46px rgba(86,70,230,.13);}
.sp-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:19px 22px;background:none;border:none;cursor:pointer;font:inherit;font-size:1rem;font-weight:700;color:var(--ink);text-align:left;letter-spacing:-.01em;transition:color .18s;}
.sp-faq-q:hover{color:var(--indigo);}
.sp-faq-chev{width:10px;height:10px;border-right:2.2px solid var(--indigo);border-bottom:2.2px solid var(--indigo);transform:rotate(45deg);transition:transform .3s cubic-bezier(.34,1.56,.64,1);flex-shrink:0;margin-right:5px;margin-top:-3px;}
.sp-faq-item.open .sp-faq-chev{transform:rotate(-135deg);margin-top:3px;}
.sp-faq-a{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1);}
.sp-faq-item.open .sp-faq-a{max-height:260px;}
.sp-faq-a p{padding:0 22px 20px;font-size:.9rem;line-height:1.85;color:var(--ink2);}

.sp-footer{margin-top:72px;padding-top:40px;border-top:0.5px solid var(--line);text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px;}
.sp-cta{display:inline-flex;align-items:center;justify-content:center;height:56px;padding:0 40px;border-radius:999px;background:linear-gradient(100deg,#5646e6,#7c4ff0);color:#fff;text-decoration:none;font-size:15px;font-weight:650;box-shadow:0 12px 34px rgba(86,70,230,.34);transition:transform .2s,box-shadow .2s,filter .2s;}
.sp-cta:hover{transform:translateY(-3px);box-shadow:0 20px 46px rgba(86,70,230,.44);filter:brightness(1.06);} .sp-arrow{transition:transform .22s;} .sp-cta:hover .sp-arrow{transform:translateX(4px);}
.sp-foot-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:10px 24px;} .sp-foot-nav a{font-size:.8rem;font-weight:600;color:var(--ink2);text-decoration:none;transition:color .18s;} .sp-foot-nav a:hover{color:var(--indigo);}
.sp-foot-meta{font-size:.72rem;color:var(--mut);} .sp-foot-meta a{color:var(--indigo);text-decoration:none;} .sp-foot-meta a:hover{text-decoration:underline;}

@media (prefers-reduced-motion:reduce){.sp *{animation:none!important;} .sp-glow{display:none;}}
@media (max-width:640px){
  .sp-hd{padding:12px 18px;} .sp-hero{padding:110px 0 32px;}
  .sp-rwd-item,.sp-tl{gap:14px;} .sp-tl-num{width:46px;height:46px;font-size:.95rem;}
}
`
