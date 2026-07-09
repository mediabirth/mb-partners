'use client'
/**
 * パートナー応募 完了ページ（/partners/thanks）。
 * LPの世界観（明るいグラデ光＋ブランドマーク＋モーション）で、丁寧な受付と期待感の演出。
 * 応募完了メール（＝面談予約リンク）はサーバ側 /api/partner-apply で送信済み。ここは静的な締めくくり。
 * 純プレゼンテーション（money・auth・DB非接触）。reduced-motion 尊重。
 */
import BrandMark from '@/components/ui/BrandMark'

const CSS = `
.pt{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:40px 22px;position:relative;overflow:hidden;
  font-family:var(--font-inter),Inter,system-ui,-apple-system,'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:#1a1830;}
.pt *{box-sizing:border-box;margin:0;}
.pt-card{position:relative;z-index:2;width:100%;max-width:560px;text-align:center;
  background:rgba(255,255,255,.66);backdrop-filter:blur(18px) saturate(1.2);-webkit-backdrop-filter:blur(18px) saturate(1.2);
  border:0.5px solid rgba(255,255,255,.85);border-radius:24px;box-shadow:0 20px 60px rgba(40,30,80,.10);padding:clamp(34px,6vw,56px) clamp(24px,5vw,44px);}
.pt-markwrap{position:relative;width:112px;height:112px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;}
.pt-ring{position:absolute;inset:0;border-radius:50%;border:1.5px solid #7c6cf0;opacity:0;}
.pt-ring1{animation:ptRing 2.8s ease-out infinite;}
.pt-ring2{animation:ptRing 2.8s ease-out .9s infinite;}
.pt-ring3{animation:ptRing 2.8s ease-out 1.8s infinite;}
@keyframes ptRing{0%{transform:scale(.42);opacity:.55}70%{opacity:.12}100%{transform:scale(1.15);opacity:0}}
.pt-mark{animation:ptPop .8s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes ptPop{0%{transform:scale(.3);opacity:0}60%{opacity:1}100%{transform:scale(1);opacity:1}}
.pt-badge{position:absolute;right:8px;bottom:8px;width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#15b37e,#0f9d76);
  display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(21,145,126,.4);animation:ptPop .7s cubic-bezier(.34,1.56,.64,1) .5s both;}
.pt-kicker{margin-top:14px;font-size:.7rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#5646e6;}
.pt-h1{margin-top:12px;font-size:clamp(1.7rem,5vw,2.3rem);font-weight:800;line-height:1.32;letter-spacing:-.03em;text-wrap:balance;}
.pt-h1 em{font-style:normal;background:linear-gradient(96deg,#5646E6,#8B5CF6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.pt-lead{margin-top:16px;font-size:clamp(.92rem,2.4vw,1.02rem);line-height:1.95;color:#54506e;}
.pt-mail{margin-top:22px;display:flex;align-items:flex-start;gap:12px;text-align:left;padding:16px 18px;border-radius:16px;
  background:rgba(86,70,230,.06);border:0.5px solid rgba(86,70,230,.16);}
.pt-mail svg{flex-shrink:0;margin-top:1px;}
.pt-mail b{font-size:.86rem;font-weight:800;color:#2b2550;}
.pt-mail p{margin-top:5px;font-size:.78rem;line-height:1.75;color:#54506e;}
.pt-note{margin-top:16px;font-size:.68rem;line-height:1.7;color:#9a95b0;}
.pt-back{margin-top:26px;display:inline-flex;align-items:center;gap:7px;font-size:.8rem;font-weight:700;color:#5646e6;text-decoration:none;transition:gap .2s;}
.pt-back:hover{gap:11px;}
.pt-fade{animation:ptUp .7s cubic-bezier(.22,1,.36,1) both;}
.pt-fade2{animation:ptUp .7s cubic-bezier(.22,1,.36,1) .12s both;}
.pt-fade3{animation:ptUp .7s cubic-bezier(.22,1,.36,1) .24s both;}
.pt-fade4{animation:ptUp .7s cubic-bezier(.22,1,.36,1) .36s both;}
.pt-fade5{animation:ptUp .7s cubic-bezier(.22,1,.36,1) .48s both;}
@keyframes ptUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.pt *{animation:none!important}}
`

export default function ThanksPage() {
  return (
    <main className="pt mb-field-bg">
      <style>{CSS}</style>
      <div className="pt-card">
        <div className="pt-markwrap pt-fade">
          <span className="pt-ring pt-ring1" /><span className="pt-ring pt-ring2" /><span className="pt-ring pt-ring3" />
          <span className="pt-mark"><BrandMark size={78} /></span>
          <span className="pt-badge" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </div>

        <div className="pt-kicker pt-fade2">Application Received</div>
        <h1 className="pt-h1 pt-fade2">応募ありがとうございます。<br /><em>確かに、受付いたしました。</em></h1>

        <p className="pt-lead pt-fade3">
          この度は MB Partners にご関心をお寄せいただき、心より感謝申し上げます。<br />
          いただいたご応募は、一件ずつ丁寧に拝見しております。
        </p>

        <div className="pt-mail pt-fade4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5646e6" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          <div>
            <b>ご登録のメールに、面談予約のご案内をお送りしました。</b>
            <p>MB Partners は、ご紹介いただく信頼をお預かりするプログラムです。まずは一度オンラインで顔合わせをさせてください。メール内のリンクから、ご都合のよい日時をお選びいただけます。</p>
          </div>
        </div>

        <p className="pt-note pt-fade5">
          数分お待ちいただいてもメールが届かない場合は、迷惑メールフォルダをご確認ください。<br />
          それでも見当たらない場合は、お手数ですが再度ご応募いただくか、担当までお問い合わせください。
        </p>

        <a className="pt-back pt-fade5" href="/partners">← パートナー募集ページへ戻る</a>
      </div>
    </main>
  )
}
