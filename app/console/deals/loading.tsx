// 体感: ボード（カンバン）に形の合うスケルトン＝汎用ダッシュボード型の形ずれを解消。
export default function DealsLoading() {
  return (
    <div style={{ padding: '18px 20px' }} aria-busy="true">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <div className="ui-skeleton" style={{ height: 30, width: 160, borderRadius: 8 }} />
        <div className="ui-skeleton" style={{ height: 30, width: 90, borderRadius: 8 }} />
        <div style={{ flex: 1 }} />
        <div className="ui-skeleton" style={{ height: 30, width: 130, borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 12, overflow: 'hidden' }}>
        {[0, 1, 2, 3, 4].map(col => (
          <div key={col} style={{ flex: '0 0 232px' }}>
            <div className="ui-skeleton" style={{ height: 14, width: 80, borderRadius: 6, marginBottom: 12 }} />
            {[0, 1, 2].map(c => (
              <div key={c} className="ui-skeleton" style={{ height: 66, borderRadius: 13, marginBottom: 8 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
