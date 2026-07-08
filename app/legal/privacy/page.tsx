import { PRIVACY, PRIVACY_VERSION } from '@/lib/legal/privacy'

// 公開ページ（登録フローの未認証ユーザーも閲覧可・/legal/terms と同じ公開経路・認証ガード配下に置かない）。
export default function LegalPrivacyPage() {
  return (
    <div style={{ background: '#E9E9ED', minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, background: '#fff', minHeight: '100dvh', boxShadow: '0 0 48px rgba(14,14,20,.12)', padding: '28px 24px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
            <g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" />
          </svg>
          <b style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.9rem' }}>MB <span style={{ color: '#4733E6' }}>Partners</span></b>
        </div>
        <h1 style={{ fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em', marginBottom: 4 }}>{PRIVACY.title}</h1>
        <p style={{ fontSize: '.62rem', color: '#9A9CA8', marginBottom: 20, fontFamily: 'Inter' }}>version {PRIVACY_VERSION}</p>

        <p style={{ fontSize: '.8rem', lineHeight: 1.9, color: '#0E0E14', marginBottom: 22 }}>{PRIVACY.intro}</p>

        {PRIVACY.sections.map((s) => (
          <section key={s.heading} style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '.9rem', fontWeight: 800, marginBottom: 8, color: '#0E0E14' }}>{s.heading}</h2>
            {s.lead && <p style={{ fontSize: '.8rem', lineHeight: 1.9, color: '#0E0E14', marginBottom: s.bullets ? 8 : 0 }}>{s.lead}</p>}
            {s.bullets && (
              <ul style={{ margin: 0, paddingLeft: '1.1em', fontSize: '.8rem', lineHeight: 1.9, color: '#0E0E14' }}>
                {s.bullets.map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
              </ul>
            )}
            {s.body && <p style={{ fontSize: '.8rem', lineHeight: 1.9, color: '#0E0E14', margin: 0 }}>{s.body}</p>}
          </section>
        ))}

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #E5E7EB', fontSize: '.78rem', lineHeight: 1.9, color: '#3A3A45' }}>
          {PRIVACY.footer.map((f) => <div key={f}>{f}</div>)}
        </div>
      </div>
    </div>
  )
}
