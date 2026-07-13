/** サプライヤー・コンソール共通クローム（v7・MBコンソールと同一文法の単一ソース）。 */
import PageGuide, { type PageGuideData } from '@/components/PageGuide'

export function SupplierTopbar({ title, guide, action }: { title: string; guide?: PageGuideData; action?: React.ReactNode }) {
  return (
    <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 500 }}>{title}</h1>
        {guide && <PageGuide data={guide} />}
      </span>
      {action}
    </div>
  )
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ margin: '4px 2px 12px', borderBottom: '0.5px solid var(--line)', paddingBottom: 8 }}>
      <h2 style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '.08em', color: 'var(--t-tertiary)', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 4, lineHeight: 1.6 }}>{subtitle}</p>}
    </div>
  )
}

/** コンソールと同一のコンテンツ余白。 */
export const CONTENT: React.CSSProperties = { padding: '24px 28px 44px', maxWidth: 1120, margin: 0, width: '100%', minWidth: 0, boxSizing: 'border-box' }
export const CARD14: React.CSSProperties = { background: 'var(--s-0, #fff)', border: '0.5px solid var(--line)', borderRadius: 14 }
