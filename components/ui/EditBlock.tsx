'use client'
/**
 * 表示/編集モードの汎用ブロック。確定値（view）＋「編集」ボタン ⇄ 入力（edit）＋キャンセル/保存。
 * カード枠は持たない（SectionCard 等の中に置く）。money/データには無関係＝表示制御のみ。
 * onEdit: 編集開始時（draft 初期化用）／onCancel: 取り消し（draft 破棄用）／onSave: 保存（false で編集継続）。
 */
import { useState, type ReactNode } from 'react'

export default function EditBlock({ view, edit, onEdit, onCancel, onSave, editLabel = '編集' }: {
  view: ReactNode
  edit: ReactNode
  onEdit?: () => void
  onCancel?: () => void
  onSave: () => Promise<boolean | void> | boolean | void
  editLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  function start() { onEdit?.(); setEditing(true) }
  function cancel() { onCancel?.(); setEditing(false) }
  async function save() {
    setSaving(true)
    try { const r = await onSave(); if (r !== false) setEditing(false) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{view}</div>
        <button
          onClick={start}
          style={{ flexShrink: 0, fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
        >
          {editLabel}
        </button>
      </div>
    )
  }
  return (
    <div>
      {edit}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={cancel}
          style={{ fontSize: '.74rem', color: 'var(--muted2)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
        >
          キャンセル
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="btn btn-p"
          style={{ fontSize: '.74rem', padding: '9px 18px', opacity: saving ? .6 : 1 }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
