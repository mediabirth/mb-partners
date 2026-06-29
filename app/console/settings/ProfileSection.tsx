'use client'
// 自分のプロフィール（表示名・アイコン・色）を各メンバー(owner/manager)が自分でいつでも変更。
// ★本人のみ＝サーバ側 /api/console/me PATCH・/api/console/avatar が auth.uid 行のみ更新。money/権限 非接触。
import { useEffect, useState } from 'react'
import AvatarEditor from '@/components/ui/AvatarEditor'
import { useConsoleSession, updateConsoleIdentity } from '@/components/ConsoleSession'

const COLORS = ['#4733E6', '#0E0E14', '#15917E', '#D98914', '#C2479E', '#2A7DE1']

export default function ProfileSection() {
  const { identity, ready } = useConsoleSession()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#4733E6')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const show = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  // identity 解決後に初期値を流し込む（自分の現在値）。
  useEffect(() => {
    if (ready && identity) { setName(identity.name ?? ''); setColor(identity.color ?? '#4733E6') }
  }, [ready, identity?.id])

  async function save() {
    if (!name.trim()) { show('表示名を入力してください'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/console/me', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { updateConsoleIdentity({ name: name.trim(), color }); show('プロフィールを保存しました') }
      else show(d.error ?? '保存に失敗しました')
    } catch { show('保存に失敗しました') } finally { setSaving(false) }
  }

  return (
    <div>
      <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 14 }}>
        コンソールに表示される<b>あなたの名前とアイコン</b>です。いつでも変更でき、自分のプロフィールのみ編集できます。
      </p>
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <AvatarEditor
          name={name || identity?.name}
          color={color}
          src={identity?.avatar_url ?? null}
          size={64}
          endpoint="/api/console/avatar"
          onChange={(url) => updateConsoleIdentity({ avatar_url: url })}
        />
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>表示名</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={60}
              placeholder="例: 神原勝彦"
              style={{ width: '100%', maxWidth: 280, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 12px', fontFamily: 'inherit', fontSize: '.84rem', background: '#fff' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>アイコンの色（画像未設定時の背景）</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`色 ${c}`}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '3px solid var(--blue)' : '2px solid #fff', boxShadow: '0 0 0 1px var(--line)' }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={save} disabled={saving} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px', opacity: saving ? .6 : 1 }}>{saving ? '保存中…' : '保存する'}</button>
          </div>
        </div>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--txt)', color: '#fff', padding: '12px 22px', borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99 }}>{toast}</div>}
    </div>
  )
}
