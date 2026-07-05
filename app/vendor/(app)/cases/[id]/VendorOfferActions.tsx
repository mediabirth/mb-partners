'use client'
/**
 * 委託提示への応答カード（提示中の割当のみ表示）。
 * 承諾/辞退 → PATCH /api/vendor/assignments/[id] → リロードで反映。
 * 辞退は確認ダイアログ（不可逆＝再提示はMB側から）。
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VendorOfferActions({ assignmentId, baseFee }: { assignmentId: string; baseFee: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const [err, setErr] = useState('')
  // 体感: 楽観更新＝タップ即座に結果状態へ（本人の操作＝安全）。失敗時は巻き戻し＋トースト。
  const [optimistic, setOptimistic] = useState<null | 'accept' | 'decline'>(null)

  async function respond(action: 'accept' | 'decline') {
    setBusy(true); setErr(''); setOptimistic(action)
    try {
      const res = await fetch(`/api/vendor/assignments/${assignmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || '送信に失敗しました'); setBusy(false); setOptimistic(null); return }  // 巻き戻し
      router.refresh()  // サーバ状態と最終同期（楽観表示のまま裏で反映）
    } catch { setErr('通信に失敗しました'); setBusy(false); setOptimistic(null) }
  }

  // 楽観表示: 承諾→「承諾しました」／辞退→終了注記（refresh 完了までの体感を即時化）。
  if (optimistic === 'accept') {
    return (
      <div style={{ margin: '12px 20px 4px', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--green-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span style={{ fontSize: '.76rem', fontWeight: 500 }}>この委託を承諾しました</span>
      </div>
    )
  }
  if (optimistic === 'decline') {
    return <p style={{ margin: '10px 20px 0', fontSize: '.68rem', color: 'var(--muted2)' }}>この委託提示は辞退しました。</p>
  }

  return (
    <div style={{ margin: '12px 20px 4px', border: '0.5px solid var(--line)', borderRadius: 14, padding: '16px 18px', background: '#fff' }}>
      <p style={{ fontSize: '.78rem', fontWeight: 500 }}>この案件の委託のご提案です</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500 }}>委託費</span>
        <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 500 }}>¥{baseFee.toLocaleString()}</span>
      </div>
      {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginTop: 8 }}>{err}</p>}
      {!confirmDecline ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button onClick={() => respond('accept')} disabled={busy}
            style={{ flex: 1, height: 40, border: 'none', borderRadius: 10, background: 'var(--txt)', color: '#fff', fontFamily: 'inherit', fontSize: '.78rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>
            受ける
          </button>
          <button onClick={() => setConfirmDecline(true)} disabled={busy}
            style={{ height: 40, padding: '0 18px', border: '0.5px solid var(--line)', borderRadius: 10, background: '#fff', color: 'var(--muted2)', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 500, cursor: 'pointer' }}>
            辞退する
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.6 }}>辞退するとこの提示は終了します。条件の再提示はMBからのみ行えます。</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button onClick={() => setConfirmDecline(false)} disabled={busy}
              style={{ height: 36, padding: '0 16px', border: '0.5px solid var(--line)', borderRadius: 10, background: '#fff', color: 'var(--muted2)', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer' }}>
              戻る
            </button>
            <button onClick={() => respond('decline')} disabled={busy}
              style={{ height: 36, padding: '0 18px', border: 'none', borderRadius: 10, background: 'var(--red)', color: '#fff', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer', opacity: busy ? .6 : 1 }}>
              辞退する
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
