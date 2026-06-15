// 遷移時の白画面を解消するスケルトン（partner shell 内に表示）
export default function AppLoading() {
  return (
    <div style={{ padding: '18px 20px' }} aria-busy="true">
      <div className="skeleton" style={{ height: 132, borderRadius: 18, marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <div className="skeleton" style={{ flex: 1, height: 64, borderRadius: 14 }} />
        <div className="skeleton" style={{ flex: 1, height: 64, borderRadius: 14 }} />
        <div className="skeleton" style={{ flex: 1, height: 64, borderRadius: 14 }} />
      </div>
      <div className="skeleton" style={{ height: 16, width: 90, borderRadius: 6, marginBottom: 12 }} />
      {[0, 1, 2].map(i => (
        <div key={i} className="skeleton" style={{ height: 56, borderRadius: 13, marginBottom: 10 }} />
      ))}
    </div>
  )
}
