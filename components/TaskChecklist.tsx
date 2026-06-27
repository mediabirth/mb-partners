'use client'

export type DealTask = {
  id: string; label: string; kind: string; required: boolean; done: boolean; note?: string | null; sort: number
}

/**
 * 協力dealの対応タスク（進捗の可視化・読み取り専用）。
 * ★操作主体を管理側へ移管：パートナーはチェックを操作できない（運営が確認して更新）。表示のみ。
 * 必須タスク全完了で「報酬獲得条件クリア」を表示。紹介dealでは本コンポーネントを出さない。
 */
export default function TaskChecklist({ tasks: initial }: { tasks: DealTask[] }) {
  const tasks = [...initial].sort((a, b) => a.sort - b.sort)
  const required = tasks.filter(t => t.required)
  const doneReq = required.filter(t => t.done).length
  const allDone = required.length > 0 && doneReq === required.length
  const pct = required.length ? Math.round((doneReq / required.length) * 100) : 0

  return (
    <div style={{ margin: '0 20px 4px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <b style={{ fontSize: '.84rem' }}>対応タスク</b>
        <span className="tnum" style={{ fontSize: '.7rem', fontWeight: 800, color: allDone ? 'var(--green)' : 'var(--blue)' }}>
          {doneReq}/{required.length}
        </span>
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 10px', lineHeight: 1.6 }}>
        協力は「対応業務」の達成が報酬の条件です。<b>対応状況は運営が確認して更新します。</b>
      </p>

      {/* progress bar */}
      <div className="bar-grow" style={{ height: 8, borderRadius: 5, background: 'var(--bg2)', overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 5, background: allDone ? 'var(--green)' : 'linear-gradient(90deg,var(--blue),var(--blue-dk))', transition: 'width .35s var(--ease-out)' }} />
      </div>

      {!allDone && (
        <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '0 0 14px', lineHeight: 1.6 }}>
          対応業務が進むと、協力の報酬が確定します。
        </p>
      )}

      {allDone && (
        <div className="celebrate-pop" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 10, padding: '9px 12px', marginBottom: 12, fontSize: '.72rem', fontWeight: 800 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
          報酬獲得条件をクリアしました！
        </div>
      )}

      {/* 読み取り専用：行はボタンでなく表示のみ（パートナーは操作不可） */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tasks.map(t => {
          const auto = t.kind !== 'manual'
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 8px', borderBottom: '1px solid #F4F4F8' }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: t.done ? 'var(--green)' : '#fff', border: `2px solid ${t.done ? 'var(--green)' : 'var(--line)'}`, color: '#fff',
              }}>
                {t.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: t.done ? 500 : 600, color: t.done ? 'var(--muted2)' : 'var(--txt)', textDecoration: t.done ? 'line-through' : 'none' }}>
                {t.label}
              </span>
              {!t.required && <span style={{ flexShrink: 0, fontSize: '.54rem', color: 'var(--muted)', fontWeight: 700 }}>任意</span>}
              {auto && <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg)', borderRadius: 20, padding: '1px 7px' }}>自動</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
