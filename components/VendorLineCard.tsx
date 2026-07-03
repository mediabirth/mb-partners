// ベンダー版「LINEと連携」カード。
// ★現状の LINE 連携基盤はパートナー(partner_id)に紐づく実装で、デリバリー(本人=delivery)では未対応。
//   誇大表示しないため、機能する風のボタンは出さず「近日対応」の正直な状態で表示する。
export default function VendorLineCard() {
  return (
    <div style={{ margin: '0 20px 14px', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: '#06C755', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 500, fontSize: '.8rem', flexShrink: 0 }}>L</span>
        <b style={{ fontSize: '.84rem', fontWeight: 500 }}>LINEと連携</b>
        <span style={{ marginLeft: 'auto', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', background: 'var(--bg2)', borderRadius: 999, padding: '3px 10px' }}>近日対応</span>
      </div>
      <p style={{ fontSize: '.64rem', color: 'var(--muted2)', lineHeight: 1.6, margin: '0 0 12px' }}>
        連携すると、委託費の確定など大事なお知らせを LINE でも受け取れます（通知用途のみ・ログインには使いません）。デリバリー向けの連携はまもなく対応します。
      </p>
      <div className="ui-btn ui-btn--secondary" style={{ width: '100%', justifyContent: 'center', minHeight: 44, opacity: .55, pointerEvents: 'none' }}>準備中</div>
    </div>
  )
}
