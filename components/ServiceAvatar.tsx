import ServiceIcon from './ServiceIcon'

/**
 * サービスのアバター表示。
 * logoPath があればロゴ画像、無ければ従来の ServiceIcon（色付きニュートラルアイコン）へフォールバック。
 * サーバー/クライアント両方で使用可（onError は使わず、logo_path はファイル存在時のみ設定する運用）。
 */
export default function ServiceAvatar({
  logoPath, icon, color, name, size = 44,
}: { logoPath?: string | null; icon: string; color: string; name: string; size?: number }) {
  if (logoPath) {
    const r = Math.round(size / 4)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoPath}
        alt={name}
        width={size}
        height={size}
        style={{ borderRadius: r, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0, background: '#fff' }}
      />
    )
  }
  return <ServiceIcon icon={icon} color={color} size={size} />
}
