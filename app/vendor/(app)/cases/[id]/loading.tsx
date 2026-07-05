// 体感: 案件詳細に形の合うスケルトン（ヘッダ→委託費→アクション→経費）。汎用ホーム型の形ずれを解消。
export default function VendorCaseLoading() {
  return (
    <div style={{ padding: '12px 20px' }} aria-busy="true">
      <div className="ui-skeleton" style={{ height: 12, width: 70, borderRadius: 6, marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 13, alignItems: 'center', marginBottom: 16 }}>
        <div className="ui-skeleton" style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="ui-skeleton" style={{ height: 18, width: '60%', borderRadius: 6, marginBottom: 6 }} />
          <div className="ui-skeleton" style={{ height: 11, width: '40%', borderRadius: 6 }} />
        </div>
      </div>
      <div className="ui-skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 12 }} />
      <div className="ui-skeleton" style={{ height: 96, borderRadius: 14, marginBottom: 12 }} />
      <div className="ui-skeleton" style={{ height: 44, borderRadius: 10 }} />
    </div>
  )
}
