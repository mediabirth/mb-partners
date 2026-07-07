/**
 * パートナー下層ページ共通シェル（/partners/guide・/rewards・/faq）。
 * LPの世界観（明るいグラデ＋グラス＋インディゴ）を軽量に共有。3Dは載せない（perf）。ページスコープ完結。
 */
import type { ReactNode } from 'react'

const LOGO = (
  <svg viewBox="0 0 48 48" fill="none" aria-hidden><rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="3" /><rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="3" /><rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="3" /><rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6" /></svg>
)

export function SubShell({ kicker, title, lead, children }: { kicker: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <main className="sp">
      <style>{SP_CSS}</style>
      <div className="sp-field" aria-hidden />
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
.sp-hd{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;padding:15px 28px;background:rgba(251,250,255,.66);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);box-shadow:0 1px 0 var(--line);}
.sp-logo{display:flex;align-items:center;gap:9px;text-decoration:none;color:var(--ink);} .sp-logo svg{height:27px;width:27px;display:block;}
.sp-logo b{font-weight:800;font-size:1rem;letter-spacing:-.02em;} .sp-logo b span{color:var(--indigo);}
.sp-login{display:inline-flex;align-items:center;height:38px;padding:0 20px;border-radius:999px;border:1.4px solid rgba(86,70,230,.32);color:var(--indigo);background:rgba(255,255,255,.5);text-decoration:none;font-size:.82rem;font-weight:700;transition:background .18s,color .18s,transform .18s;}
.sp-login:hover{background:var(--indigo);border-color:var(--indigo);color:#fff;transform:translateY(-1px);}
.sp-content{position:relative;z-index:2;max-width:820px;margin:0 auto;padding:0 24px 40px;}
.sp-hero{padding:130px 0 44px;}
.sp-back{display:inline-flex;align-items:center;gap:7px;font-size:.82rem;font-weight:600;color:var(--ink2);text-decoration:none;transition:gap .2s,color .18s;} .sp-back:hover{color:var(--indigo);gap:11px;} .sp-back span{transition:transform .2s;} .sp-back:hover span{transform:translateX(-3px);}
.sp-kicker{display:flex;align-items:center;gap:9px;margin-top:24px;font-size:.72rem;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--indigo);}
.sp-kicker i{width:6px;height:6px;border-radius:50%;background:var(--indigo);box-shadow:0 0 0 4px rgba(86,70,230,.14);}
.sp-h1{margin-top:16px;font-size:clamp(2.1rem,5vw,3.2rem);font-weight:800;line-height:1.18;letter-spacing:-.04em;color:var(--ink);text-wrap:balance;}
.sp-lead{margin-top:18px;font-size:clamp(1rem,2vw,1.15rem);line-height:1.85;color:var(--ink2);max-width:34em;}
.sp-h2{font-size:clamp(1.4rem,3vw,1.85rem);font-weight:800;letter-spacing:-.03em;color:var(--ink);margin:56px 0 22px;}
.sp-card{background:rgba(255,255,255,.66);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);border-radius:20px;box-shadow:0 12px 40px rgba(40,30,80,.07);padding:clamp(22px,3.4vw,32px);transition:transform .2s,box-shadow .2s;}
.sp-card:hover{transform:translateY(-4px);box-shadow:0 24px 56px rgba(86,70,230,.12);}

/* タイムライン（guide） */
.sp-timeline{position:relative;display:flex;flex-direction:column;gap:16px;margin-top:8px;}
.sp-tl{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;}
.sp-tl-num{position:relative;flex-shrink:0;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:1.05rem;background:linear-gradient(150deg,#8b5cf6,#5646e6);box-shadow:0 12px 30px rgba(86,70,230,.3);}
.sp-tl:nth-child(2) .sp-tl-num{background:linear-gradient(150deg,#3ec6a0,#15917e);box-shadow:0 12px 30px rgba(21,145,126,.28);}
.sp-tl:nth-child(4) .sp-tl-num{background:linear-gradient(150deg,#ffc24d,#f2971b);box-shadow:0 12px 30px rgba(242,151,27,.3);}
.sp-tl-body{padding-top:4px;} .sp-tl-t{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);} .sp-tl-d{margin-top:8px;font-size:.94rem;line-height:1.75;color:var(--ink2);}

/* 報酬詳細（rewards） */
.sp-rwd{display:flex;flex-direction:column;gap:16px;margin-top:8px;}
.sp-rwd-item{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;}
.sp-rwd-badge{flex-shrink:0;width:64px;height:64px;border-radius:18px;display:flex;align-items:center;justify-content:center;color:var(--rc);background:linear-gradient(150deg,color-mix(in srgb,var(--rc) 14%,#fff),color-mix(in srgb,var(--rc) 5%,#fff));border:1px solid color-mix(in srgb,var(--rc) 16%,transparent);font-weight:800;font-size:.9rem;}
.sp-rwd-t{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;color:var(--ink);} .sp-rwd-t b{color:var(--rc);}
.sp-rwd-d{margin-top:7px;font-size:.92rem;line-height:1.7;color:var(--ink2);}
.sp-note{margin-top:26px;font-size:.76rem;line-height:1.7;color:var(--mut);background:rgba(86,70,230,.05);border-radius:12px;padding:16px 18px;}

/* FAQ（faq） */
.sp-faq{display:flex;flex-direction:column;gap:12px;margin-top:8px;}
.sp-faq-item{border-radius:16px;background:rgba(255,255,255,.6);backdrop-filter:blur(16px) saturate(1.2);-webkit-backdrop-filter:blur(16px) saturate(1.2);border:0.5px solid rgba(255,255,255,.85);box-shadow:0 8px 30px rgba(40,30,80,.06);overflow:hidden;transition:box-shadow .25s;}
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

@media (max-width:640px){
  .sp-hd{padding:12px 18px;} .sp-hero{padding:110px 0 32px;}
  .sp-rwd-item,.sp-tl{gap:14px;} .sp-tl-num{width:46px;height:46px;font-size:.95rem;}
}
`
