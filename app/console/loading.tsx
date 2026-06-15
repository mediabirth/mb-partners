// コンソール遷移時の白画面を解消するスケルトン
export default function ConsoleLoading() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }} aria-busy="true">
      <div className="skeleton" style={{ width: 230, height: '100vh', borderRadius: 0, flexShrink: 0, opacity: .5 }} />
      <div style={{ flex: 1, padding: '30px 32px', maxWidth: 1120 }}>
        <div className="skeleton" style={{ height: 28, width: 200, borderRadius: 8, marginBottom: 22 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 14 }} />)}
        </div>
        <div className="skeleton" style={{ height: 240, borderRadius: 14 }} />
      </div>
    </div>
  )
}
