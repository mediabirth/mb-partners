'use client'
import { useEffect, useState } from 'react'
import ServiceAvatar from '@/components/ServiceAvatar'
import RewardPill from '@/components/ui/RewardPill'
import { rewardValueText } from '@/lib/reward-format'
import type { CoopTaskItem } from '@/lib/coop-task-display'

// 詳細シート（共有）：下からスライドイン・overlayタップ/ハンドル/閉じるボタンで閉じる・reduced-motion対応。
//   variant='menu'（既定）＝メニュー詳細（紹介フロー/案件詳細のⓘ）・variant='brand'＝事業概要（ブランドのⓘ）。
//   節は該当データがnullなら非表示。塗りボタン禁止（閉じる=0.5px枠）・罫線0.5px・weightは400/500のみ。

// 自己完結のための最小サービス形（ServiceWithMenus 等はこれを構造的に満たす）。
export type SheetService = {
  name: string
  logo_path: string | null
  icon: string
  color: string
  image_url?: string | null
  description?: string | null
}

// 報酬の最小形（MenuReward / reward_snapshot 由来の値をそのまま渡せる・表示のみ）。
export type SheetReward = {
  reward_type: 'fixed' | 'rate' | 'continuous'
  reward_value: number | string
  reward_trigger?: string | null
  default_months?: number | null
}

export type SheetMenuItem = { name: string; reward: SheetReward | null }

type BaseProps = { svc: SheetService; onClose: () => void }
export type MenuSheetProps = BaseProps & {
  variant?: 'menu'
  menuName: string
  menuDescription: string | null
  reward: SheetReward | null
  tasks: CoopTaskItem[]
}
export type BrandSheetProps = BaseProps & {
  variant: 'brand'
  audience?: string | null      // services.target_audience（フック文）
  menus: SheetMenuItem[]        // 提供メニュー一覧（名前＋先頭報酬）
}

// 報酬ピル（共通 RewardPill・継続は「粗利X%」500＋「/月」400）。refer の MenuRowPill と同一記法。
function SheetRewardPill({ reward }: { reward: SheetReward }) {
  if (reward.reward_type === 'continuous') {
    return <RewardPill style={{ flexShrink: 0 }}><span style={{ fontWeight: 500 }}>粗利（税抜）の{Number(reward.reward_value)}%</span><span style={{ fontWeight: 400 }}>/月</span></RewardPill>
  }
  return <RewardPill style={{ flexShrink: 0 }}>{rewardValueText(reward)}</RewardPill>
}

export default function MenuDetailSheet(props: MenuSheetProps | BrandSheetProps) {
  const { svc, onClose } = props
  const isBrand = props.variant === 'brand'
  const [open, setOpen] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    const id = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(id)
  }, [])
  const dur = reduced ? 0 : 220
  function close() {
    if (reduced) { onClose(); return }
    setOpen(false)
    setTimeout(onClose, dur)
  }
  const imageUrl = svc.image_url || null
  const svcDesc = svc.description || null
  const trigger = !isBrand ? (props.reward?.reward_trigger || null) : null
  const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.06em', marginBottom: 6 }
  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,.34)', opacity: open ? 1 : 0, transition: `opacity ${dur}ms ease-out`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: '18px 18px 0 0', padding: '10px 20px 28px', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: `transform ${dur}ms ease-out` }}>
        {/* 1. ハンドル */}
        <button type="button" onClick={close} aria-label="閉じる" style={{ display: 'block', width: 38, height: 4, borderRadius: 999, background: 'var(--line)', border: 'none', margin: '2px auto 16px', cursor: 'pointer', padding: 0 }} />
        {/* 2. ヒーロー：image_url／未設定はロゴタイル56pxのフォールバック（全ブランドが視覚アンカーを持つ） */}
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 12, marginBottom: 16, display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: 140, borderRadius: 12, marginBottom: 16, background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={56} />
          </div>
        )}
        {/* 3. 名前（menu=メニュー名＋報酬ピル／brand=ブランド名） */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, letterSpacing: '-.01em' }}>{isBrand ? svc.name : props.menuName}</h3>
          {!isBrand && props.reward && <SheetRewardPill reward={props.reward} />}
        </div>
        {/* 4. 「{reward_trigger}に確定」右寄せ（menu のみ・選択中報酬のトリガー・空なら非表示） */}
        {trigger && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--muted2)', marginTop: 4 }}>{trigger}に確定</div>
        )}
        {isBrand ? (
          <>
            {/* brand 5. フック文（target_audience・折返し） */}
            {props.audience && (
              <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)', marginTop: 8 }}>{props.audience}</p>
            )}
            {/* brand 6. 「{service}とは」＋事業説明 */}
            {svcDesc && (
              <div style={{ marginTop: 20 }}>
                <div style={headStyle}>{svc.name}とは</div>
                <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)' }}>{svcDesc}</p>
              </div>
            )}
            {/* brand 7. 提供メニュー一覧（名前＋報酬ピル・0.5px罫線） */}
            {props.menus.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={headStyle}>提供メニュー</div>
                <div style={{ border: '0.5px solid var(--line)', borderRadius: 12, padding: '0 14px' }}>
                  {props.menus.map((m, i) => (
                    <div key={`${m.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      {m.reward && <SheetRewardPill reward={m.reward} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* menu 5. 「{service}とは」＋サービス説明 */}
            {svcDesc && (
              <div style={{ marginTop: 20 }}>
                <div style={headStyle}>{svc.name}とは</div>
                <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)' }}>{svcDesc}</p>
              </div>
            )}
            {/* menu 6. 「このメニューでは」＋メニュー説明 */}
            {props.menuDescription && (
              <div style={{ marginTop: 20 }}>
                <div style={headStyle}>このメニューでは</div>
                <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--muted2)' }}>{props.menuDescription}</p>
              </div>
            )}
            {/* menu 7. あなたの協力タスク */}
            {props.tasks.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={headStyle}>あなたの協力タスク</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {props.tasks.map(t => (
                    <span key={t.label} className="no-break" style={{ fontSize: 11, color: 'var(--muted2)', border: '0.5px solid var(--line)', borderRadius: 999, padding: '2px 9px' }}>{t.label}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {/* 8. 閉じる（塗りボタン禁止・0.5px枠） */}
        <button type="button" onClick={close}
          style={{ width: '100%', minHeight: 44, marginTop: 24, background: '#fff', color: 'var(--txt)', border: '0.5px solid var(--line)', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          閉じる
        </button>
      </div>
    </div>
  )
}
