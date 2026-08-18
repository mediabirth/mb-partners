import { buildSocialProofCopy, type SocialProofCounts } from '@/lib/social-proof'

/** 件数0の行は作らず、全0ならsection自体をDOMへ出さない。 */
export default function SocialProofCard({ counts }: { counts: SocialProofCounts }) {
  const lines = buildSocialProofCopy(counts, 30).lines
  if (lines.length === 0) return null
  return (
    <section data-social-proof="network-heartbeat" style={{ margin: '14px 20px 0', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 13, padding: '14px 16px' }}>
      <h2 style={{ fontSize: '11px', fontWeight: 500, color: 'var(--t-tertiary)', letterSpacing: '.08em', margin: '0 0 10px' }}>ネットワークの鼓動</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {lines.map(line => (
          <p key={line} style={{ margin: 0, fontSize: '.7rem', color: 'var(--txt)', lineHeight: 1.7 }}>{line}</p>
        ))}
      </div>
    </section>
  )
}
