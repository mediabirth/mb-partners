'use client'
import Link from 'next/link'
import { useState } from 'react'

type MonthData = {
  ym: string; year: string; month: string
  deals: { date: string; name: string; channel: string; amount: number }[]
  gross: number; wh: number; net: number; isPaid: boolean
}

type Props = {
  partnerName: string; partnerCode: string; bankDisplay: string
  monthlyData: MonthData[]
  annualGross: number; annualWh: number; annualNet: number
  taxType: string
  initialMode?: 'monthly' | 'annual'   // 磨き③: 「年間集計」ボタンからの深リンク（?mode=annual）
}

export default function StatementClient({
  partnerName, partnerCode, bankDisplay,
  monthlyData, annualGross, annualWh, annualNet, taxType,
  initialMode = 'monthly',
}: Props) {
  const [mode, setMode] = useState<'monthly' | 'annual'>(initialMode)
  const [selMonth, setSelMonth] = useState(monthlyData[0]?.ym ?? '')

  const now = new Date()
  const yearLabel = now.getFullYear()

  const md = monthlyData.find(m => m.ym === selMonth) ?? monthlyData[0]

  return (
    <div>
      <Link href="/app/rewards" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, textDecoration: 'none',
      }}>
        ← 報酬に戻る
      </Link>

      {/* Mode switcher */}
      <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, margin: '12px 20px 0' }}>
        <button onClick={() => setMode('monthly')} style={{
          flex: 1, border: 'none', padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
          color: mode === 'monthly' ? 'var(--txt)' : 'var(--muted2)',
          background: mode === 'monthly' ? '#fff' : 'transparent',
          boxShadow: mode === 'monthly' ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
          transition: 'all .25s',
        }}>
          支払明細 {md ? `(${md.month}月)` : ''}
        </button>
        <button onClick={() => setMode('annual')} style={{
          flex: 1, border: 'none', padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
          color: mode === 'annual' ? 'var(--txt)' : 'var(--muted2)',
          background: mode === 'annual' ? '#fff' : 'transparent',
          boxShadow: mode === 'annual' ? '0 2px 8px rgba(14,14,20,.08)' : 'none',
          transition: 'all .25s',
        }}>
          年間集計 {yearLabel}
        </button>
      </div>

      {/* Month selector for monthly mode */}
      {mode === 'monthly' && monthlyData.length > 1 && (
        <div style={{ margin: '10px 20px 0' }}>
          <select value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{
            width: '100%', border: '1px solid var(--line)', borderRadius: 9, padding: '10px 12px',
            fontFamily: 'inherit', fontSize: '.8rem', background: '#fff',
          }}>
            {monthlyData.map(m => (
              <option key={m.ym} value={m.ym}>{m.year}年{m.month}月{m.isPaid ? '（支払済）' : '（振込予定）'}</option>
            ))}
          </select>
        </div>
      )}

      {/* Document area */}
      <div id="docArea">
        {mode === 'monthly' && md ? (
          <div style={{ margin: '14px 20px', border: '1px solid var(--line)', borderRadius: 4, padding: '26px 24px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <b style={{ fontFamily: 'Inter', fontSize: '.9rem' }}>MB Partners</b>
                <small style={{ display: 'block', fontSize: '.58rem', color: 'var(--muted)', marginTop: 3 }}>株式会社Media Birth / 大阪府吹田市</small>
              </div>
              <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="3"/>
                <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="3"/>
                <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="3"/>
                <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6"/>
              </svg>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 500, letterSpacing: '.3em', textAlign: 'center', margin: '6px 0 20px' }}>支払明細書</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 16, lineHeight: 1.8 }}>
              <span>{partnerName} 様<br/>パートナーコード {partnerCode}</span>
              <span style={{ textAlign: 'right' }}>
                対象期間 {md.year}/{md.month}/01–{md.month}/{new Date(Number(md.year), Number(md.month), 0).getDate()}<br/>
                支払予定日 {md.year}/{md.month}/{new Date(Number(md.year), Number(md.month), 0).getDate()}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.7rem', marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={{ fontWeight: 500, textAlign: 'left', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem' }}>日付</th>
                  <th style={{ fontWeight: 500, textAlign: 'left', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem' }}>摘要</th>
                  <th style={{ fontWeight: 500, textAlign: 'left', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem' }}>区分</th>
                  <th style={{ fontWeight: 500, textAlign: 'right', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem', fontVariantNumeric: 'tabular-nums' }}>金額</th>
                </tr>
              </thead>
              <tbody>
                {md.deals.map((d, i) => (
                  <tr key={i}>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>{d.date}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>{d.name}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>{d.channel}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>¥{d.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {md.wh > 0 && (
                  <tr>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>—</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>源泉所得税(対象報酬分)</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>—</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums', color: 'var(--red)' }}>−¥{md.wh.toLocaleString()}</td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', fontSize: '.72rem' }}>差引お支払額</td>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>¥{md.net.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            {bankDisplay && (
              <div style={{ fontSize: '.58rem', color: 'var(--muted)', lineHeight: 1.8, marginTop: 14 }}>
                振込先: {bankDisplay} / 報酬額は税抜表示です。消費税はインボイス登録の有無に応じて別途のお取り扱いとなります。源泉所得税は税法上の対象報酬にのみ適用されます。本明細は確定申告の参考資料としてご利用いただけます。
              </div>
            )}
          </div>
        ) : mode === 'annual' ? (
          <div style={{ margin: '14px 20px', border: '1px solid var(--line)', borderRadius: 4, padding: '26px 24px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <b style={{ fontFamily: 'Inter', fontSize: '.9rem' }}>MB Partners</b>
                <small style={{ display: 'block', fontSize: '.58rem', color: 'var(--muted)', marginTop: 3 }}>株式会社Media Birth / 大阪府吹田市</small>
              </div>
              <svg width="26" height="26" viewBox="0 0 48 48" fill="none">
                <rect x="6" y="6" width="14" height="14" rx="3" stroke="#4733E6" strokeWidth="3"/>
                <rect x="28" y="6" width="14" height="14" rx="7" stroke="#4733E6" strokeWidth="3"/>
                <rect x="6" y="28" width="14" height="14" rx="7" stroke="#0E0E14" strokeWidth="3"/>
                <rect x="28" y="28" width="14" height="14" rx="3" fill="#4733E6"/>
              </svg>
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 500, letterSpacing: '.3em', textAlign: 'center', margin: '6px 0 20px' }}>年間支払集計 {yearLabel}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.66rem', color: 'var(--muted2)', marginBottom: 16, lineHeight: 1.8 }}>
              <span>{partnerName} 様<br/>パートナーコード {partnerCode}</span>
              <span style={{ textAlign: 'right' }}>
                集計期間 {yearLabel}/01/01–{new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }).replace(/\//g, '/')}<br/>
                発行日 {new Date().toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.7rem', marginBottom: 14 }}>
              <thead>
                <tr>
                  <th style={{ fontWeight: 500, textAlign: 'left', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem' }}>月</th>
                  <th style={{ fontWeight: 500, textAlign: 'right', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem', fontVariantNumeric: 'tabular-nums' }}>件数</th>
                  <th style={{ fontWeight: 500, textAlign: 'right', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem', fontVariantNumeric: 'tabular-nums' }}>報酬</th>
                  <th style={{ fontWeight: 500, textAlign: 'right', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem', fontVariantNumeric: 'tabular-nums' }}>源泉</th>
                  <th style={{ fontWeight: 500, textAlign: 'right', borderBottom: '1.5px solid var(--txt)', padding: '7px 4px', fontSize: '.62rem', fontVariantNumeric: 'tabular-nums' }}>支払額</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.filter(m => m.ym.startsWith(String(yearLabel))).map(m => (
                  <tr key={m.ym}>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px' }}>{m.year}/{m.month}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right' }}>{m.deals.length}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>¥{m.gross.toLocaleString()}</td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums', color: m.wh > 0 ? 'var(--red)' : undefined }}>
                      {m.wh > 0 ? `−¥${m.wh.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ borderBottom: '1px solid var(--line)', padding: '8px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>
                      ¥{m.net.toLocaleString()}{!m.isPaid ? '(予定)' : ''}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px' }}>累計</td>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', textAlign: 'right' }}>
                    {monthlyData.filter(m => m.ym.startsWith(String(yearLabel))).reduce((s, m) => s + m.deals.length, 0)}
                  </td>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>¥{annualGross.toLocaleString()}</td>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums', color: annualWh > 0 ? 'var(--red)' : undefined }}>
                    {annualWh > 0 ? `−¥${annualWh.toLocaleString()}` : '—'}
                  </td>
                  <td style={{ borderTop: '1.5px solid var(--txt)', fontWeight: 500, padding: '10px 4px', textAlign: 'right', fontFamily: 'Inter', fontVariantNumeric: 'tabular-nums' }}>¥{annualNet.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: '.58rem', color: 'var(--muted)', lineHeight: 1.8, marginTop: 14 }}>
              本集計は確定申告(雑所得/事業所得)の参考資料です。支払調書は対象者へ翌年1月に発行します。
            </div>
          </div>
        ) : (
          <p style={{ padding: '40px 20px', fontSize: '.74rem', color: 'var(--muted2)', textAlign: 'center' }}>
            確定・支払済みの明細がありません。
          </p>
        )}
      </div>

      {/* Print button */}
      <div style={{ margin: '4px 20px 20px' }}>
        <button onClick={() => window.print()} className="btn btn-p" style={{ width: '100%' }}>
          印刷 / PDFとして保存
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }}/>
        </button>
      </div>
    </div>
  )
}
