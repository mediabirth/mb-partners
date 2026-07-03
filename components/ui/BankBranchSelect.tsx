'use client'
/**
 * 銀行→支店の段階選択（全銀マスタ検索・B群）。
 * 1) 銀行名を検索（空のときは主要行を提示）→ 選択で支店検索が開く
 * 2) 支店名を検索 → 選択で確定
 * マスタに無い金融機関のための自由入力フォールバック付き。v2.2（0.5px罫線・weight400/500・静かな規律）。
 */
import { useEffect, useRef, useState } from 'react'

export type BankDraft = { bank_name: string; bank_code?: string; branch_name: string; branch_code?: string }

type Opt = { code: string; name: string; display: string }

const bx: React.CSSProperties = { width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, padding: '11px 13px', fontFamily: 'inherit', fontSize: '.86rem', color: 'var(--txt)', background: '#fff' }
const listBox: React.CSSProperties = { border: '0.5px solid var(--line)', borderRadius: 9, marginTop: 6, overflow: 'hidden', background: '#fff', maxHeight: 218, overflowY: 'auto' }
const rowBtn: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', padding: '10px 13px', border: 'none', borderBottom: '0.5px solid var(--line)', background: 'none', fontFamily: 'inherit', fontSize: '.8rem', fontWeight: 400, color: 'var(--txt)', cursor: 'pointer', textAlign: 'left' }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export default function BankBranchSelect({ value, onChange, labelWeight = 500 }: {
  value: BankDraft
  onChange: (v: BankDraft) => void
  labelWeight?: number
}) {
  const [manual, setManual] = useState(false)
  // 検索ステート（選択済みなら閉じた表示）
  const [bankQ, setBankQ] = useState('')
  const [bankOpts, setBankOpts] = useState<Opt[]>([])
  const [bankOpen, setBankOpen] = useState(false)
  const [branchQ, setBranchQ] = useState('')
  const [branchOpts, setBranchOpts] = useState<Opt[]>([])
  const [branchOpen, setBranchOpen] = useState(false)
  const dBankQ = useDebounced(bankQ, 220)
  const dBranchQ = useDebounced(branchQ, 220)
  const abortRef = useRef<AbortController | null>(null)

  const bankChosen = !!value.bank_name
  const branchChosen = !!value.branch_name

  useEffect(() => {
    if (manual || bankChosen || !bankOpen) return
    abortRef.current?.abort()
    const ac = new AbortController(); abortRef.current = ac
    fetch(`/api/banks?q=${encodeURIComponent(dBankQ)}`, { signal: ac.signal })
      .then(r => r.json()).then(d => setBankOpts(d.banks ?? [])).catch(() => {})
  }, [dBankQ, manual, bankChosen, bankOpen])

  useEffect(() => {
    if (manual || !value.bank_code || branchChosen || !branchOpen) return
    abortRef.current?.abort()
    const ac = new AbortController(); abortRef.current = ac
    fetch(`/api/banks/${value.bank_code}/branches?q=${encodeURIComponent(dBranchQ)}`, { signal: ac.signal })
      .then(r => r.json()).then(d => setBranchOpts(d.branches ?? [])).catch(() => {})
  }, [dBranchQ, manual, value.bank_code, branchChosen, branchOpen])

  const lbl: React.CSSProperties = { display: 'block', fontSize: '.66rem', fontWeight: labelWeight, color: 'var(--muted2)', marginBottom: 5 }
  const chosenRow: React.CSSProperties = { ...bx, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }
  const clearBtn: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--c-blue)', fontSize: '.72rem', fontWeight: 500, cursor: 'pointer', padding: 0, flexShrink: 0, fontFamily: 'inherit' }

  if (manual) {
    return (
      <div>
        <div style={{ marginBottom: 13 }}>
          <span style={lbl}>銀行 *</span>
          <input value={value.bank_name} onChange={e => onChange({ ...value, bank_name: e.target.value, bank_code: undefined })} placeholder="例：〇〇信用金庫" style={bx} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={lbl}>支店 *</span>
          <input value={value.branch_name} onChange={e => onChange({ ...value, branch_name: e.target.value, branch_code: undefined })} placeholder="例：本店" style={bx} />
        </div>
        <button type="button" onClick={() => { setManual(false); onChange({ bank_name: '', branch_name: '' }) }} style={clearBtn}>検索に戻す</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 13 }}>
        <span style={lbl}>銀行 *</span>
        {bankChosen ? (
          <div style={chosenRow}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.bank_name}</span>
            <button type="button" onClick={() => { onChange({ bank_name: '', branch_name: '' }); setBankQ(''); setBranchQ(''); setBankOpen(true) }} style={clearBtn}>変更</button>
          </div>
        ) : (
          <>
            <input
              value={bankQ}
              onChange={e => { setBankQ(e.target.value); setBankOpen(true) }}
              onFocus={() => setBankOpen(true)}
              placeholder="銀行名で検索（例：みずほ）"
              style={bx}
              autoComplete="off"
            />
            {bankOpen && bankOpts.length > 0 && (
              <div style={listBox}>
                {bankOpts.map(b => (
                  <button key={b.code} type="button" style={rowBtn}
                    onClick={() => { onChange({ bank_name: b.display, bank_code: b.code, branch_name: '', branch_code: undefined }); setBranchQ(''); setBranchOpen(true) }}>
                    <span>{b.display}</span>
                    <span style={{ fontFamily: 'Inter', fontSize: '.66rem', color: 'var(--muted)' }}>{b.code}</span>
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setManual(true)} style={{ ...clearBtn, marginTop: 7, fontSize: '.66rem', color: 'var(--muted2)' }}>
              見つからない場合は自由入力
            </button>
          </>
        )}
      </div>

      {bankChosen && (
        <div style={{ marginBottom: 6 }}>
          <span style={lbl}>支店 *</span>
          {branchChosen ? (
            <div style={chosenRow}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.branch_name}</span>
              <button type="button" onClick={() => { onChange({ ...value, branch_name: '', branch_code: undefined }); setBranchQ(''); setBranchOpen(true) }} style={clearBtn}>変更</button>
            </div>
          ) : (
            <>
              <input
                value={branchQ}
                onChange={e => { setBranchQ(e.target.value); setBranchOpen(true) }}
                onFocus={() => setBranchOpen(true)}
                placeholder="支店名で検索（例：渋谷）"
                style={bx}
                autoComplete="off"
              />
              {branchOpen && branchOpts.length > 0 && (
                <div style={listBox}>
                  {branchOpts.map(b => (
                    <button key={b.code} type="button" style={rowBtn}
                      onClick={() => onChange({ ...value, branch_name: b.display, branch_code: b.code })}>
                      <span>{b.display}</span>
                      <span style={{ fontFamily: 'Inter', fontSize: '.66rem', color: 'var(--muted)' }}>{b.code}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setManual(true)} style={{ ...clearBtn, marginTop: 7, fontSize: '.66rem', color: 'var(--muted2)' }}>
                見つからない場合は自由入力
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
