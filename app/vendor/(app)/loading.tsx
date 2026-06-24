// Step5perf：遷移時の白画面を解消するスケルトン（vendor shell 内に表示）。
// console/app の perf(F) ルートレベル loading をvendorにもパリティ適用（vendorだけ未適用だった）。
export default function VendorLoading() {
  return (
    <div style={{ padding: '18px 20px' }} aria-busy="true">
      <div className="ui-skeleton" style={{ height: 150, borderRadius: 18, marginBottom: 18 }} />
      <div className="ui-skeleton" style={{ height: 16, width: 90, borderRadius: 6, marginBottom: 12 }} />
      <div className="ui-skeleton" style={{ height: 64, borderRadius: 13, marginBottom: 18 }} />
      <div className="ui-skeleton" style={{ height: 16, width: 120, borderRadius: 6, marginBottom: 12 }} />
      {[0, 1, 2].map(i => (
        <div key={i} className="ui-skeleton" style={{ height: 64, borderRadius: 14, marginBottom: 10 }} />
      ))}
    </div>
  )
}
