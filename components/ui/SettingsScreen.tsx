/**
 * BR-V3：app/vendor 共通の設定画面（単一ソース）。タイトル・通知セクション・ラベル・余白は完全一致。
 * surface差はリンク集合（config）・通知チャネルの state・ログアウト要素の注入のみ。純プレゼンテーション。
 */
import React from 'react'
import { SettingsRow, NotiRow } from './SettingsRow'
import { BUILD_STAMP } from '@/lib/build-stamp'

export type SettingsLink = { href: string; label: string }
export type SettingsNoti = { title: string; desc: string; state: 'on' | 'soon' }

export default function SettingsScreen({ links, notifications, logout }: {
  links: SettingsLink[]
  notifications: SettingsNoti[]
  logout: React.ReactNode
}) {
  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 6px' }}>
        <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>設定</h2>
      </div>

      <div style={{ margin: '6px 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        {links.map((l, i) => <SettingsRow key={l.href} href={l.href} last={i === links.length - 1}>{l.label}</SettingsRow>)}
      </div>

      {/* アプリ（PWA）— app/vendor 共通 */}
      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>アプリ</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 15px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.77rem', color: 'var(--txt)', fontWeight: 600 }}>ホーム画面に追加</div>
            <div style={{ fontSize: '.66rem', color: 'var(--muted)', marginTop: 2 }}>共有 → 「ホーム画面に追加」でアプリのように全画面で使えます。</div>
          </div>
          <span style={{ flexShrink: 0, fontSize: '.64rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: 'var(--green)', background: 'var(--green-bg)' }}>対応</span>
        </div>
      </div>

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>通知</div>
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        {notifications.map((n, i) => <NotiRow key={n.title} title={n.title} desc={n.desc} state={n.state} last={i === notifications.length - 1} />)}
      </div>

      <div style={{ margin: '4px 20px 8px' }}>{logout}</div>
      {/* BR-DIAG2：版数スタンプ（app/vendor 共通の SettingsScreen に表示＝両面で同一ビルドを確認）。 */}
      <div style={{ textAlign: 'center', fontSize: '.5rem', color: 'var(--muted)', padding: '4px 0 30px', fontFamily: 'Inter' }}>build {BUILD_STAMP}</div>
    </div>
  )
}
