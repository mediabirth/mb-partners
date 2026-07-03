'use client'
// 自分のプロフィール（表示名・アイコン）を各メンバー(owner/manager)が自分でいつでも変更。表示/編集モード。
// ★本人のみ＝サーバ側 /api/console/me PATCH・/api/console/avatar が auth.uid 行のみ更新。money/権限 非接触。
// ★メールは認証に紐づくため表示のみ（変更不可）。★色パレットは廃止（画像 or イニシャル＋色fallback）。
import { useState } from 'react'
import AvatarEditor from '@/components/ui/AvatarEditor'
import Avatar from '@/components/ui/Avatar'
import EditBlock from '@/components/ui/EditBlock'
import { useConsoleSession, updateConsoleIdentity } from '@/components/ConsoleSession'

const ROLE_JP: Record<string, string> = { owner: 'オーナー', manager: 'マネージャー', admin: '管理者', staff: 'スタッフ', viewer: '閲覧者' }

export default function ProfileSection() {
  const { identity } = useConsoleSession()
  const [draftName, setDraftName] = useState('')
  const [toast, setToast] = useState('')
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const name = identity?.name ?? ''
  const email = identity?.email ?? ''
  const color = identity?.color ?? '#4733E6'
  const avatar = identity?.avatar_url ?? null
  const roleJa = identity?.role ? (ROLE_JP[identity.role] ?? identity.role) : ''

  async function save() {
    const n = draftName.trim()
    if (!n) { show('表示名を入力してください'); return false }
    const r = await fetch('/api/console/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n }),
    })
    if (r.ok) { updateConsoleIdentity({ name: n }); show('プロフィールを保存しました'); return true }
    const d = await r.json().catch(() => ({})); show(d.error ?? '保存に失敗しました'); return false
  }

  const view = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <Avatar name={name || '—'} color={color} src={avatar} size={56} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.92rem', fontWeight: 500 }}>{name || '—'}</div>
        <div style={{ fontSize: '.68rem', color: 'var(--muted2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
        {roleJa && <div style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--blue)', background: 'var(--blue-bg2)', borderRadius: 6, padding: '2px 8px', display: 'inline-block', marginTop: 6 }}>{roleJa}</div>}
      </div>
    </div>
  )

  const edit = (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <AvatarEditor
        name={draftName || name}
        color={color}
        src={avatar}
        size={64}
        endpoint="/api/console/avatar"
        onChange={(url) => updateConsoleIdentity({ avatar_url: url })}
      />
      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>表示名</label>
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            maxLength={60}
            placeholder="例: 神原勝彦"
            style={{ width: '100%', maxWidth: 280, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.84rem', background: '#fff' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>メールアドレス（変更不可）</label>
          <input
            value={email}
            readOnly
            disabled
            style={{ width: '100%', maxWidth: 280, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.84rem', background: 'var(--bg2)', color: 'var(--muted2)' }}
          />
        </div>
      </div>
    </div>
  )

  return (
    <>
      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>
        コンソールに表示される<b>あなたの名前とアイコン</b>です。自分のプロフィールのみ編集できます。
      </p>
      <EditBlock view={view} edit={edit} onEdit={() => setDraftName(name)} onSave={save} />
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 500, zIndex: 99 }}>{toast}</div>}
    </>
  )
}
