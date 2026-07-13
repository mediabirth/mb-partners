/** サプライヤー・コンソール配下の遷移スケルトン（サクサク・実レイアウト模写＝白紙禁止）。 */
export default function SupplierSectionLoading() {
  return (
    <div aria-busy="true" style={{ padding: '18px 18px 40px', maxWidth: 1120, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div className="ui-skeleton" style={{ width: 120, height: 20, borderRadius: 6, marginBottom: 14 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[0, 1, 2].map(i => <div key={i} className="ui-skeleton" style={{ height: 74, borderRadius: 13 }} />)}
      </div>
      <div className="ui-skeleton" style={{ height: 220, borderRadius: 13, marginBottom: 12 }} />
      <div className="ui-skeleton" style={{ height: 160, borderRadius: 13 }} />
    </div>
  )
}
