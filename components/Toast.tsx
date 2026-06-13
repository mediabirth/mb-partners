'use client'
import { useEffect, useState } from 'react'

export type ToastType = 'default' | 'success' | 'error'

export function Toast({ message, type = 'default', onDone }: {
  message: string
  type?: ToastType
  onDone?: () => void
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDone?.(), 300)
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  const bg =
    type === 'success' ? 'var(--green)' :
    type === 'error'   ? 'var(--red)'   :
    'var(--txt)'

  return (
    <div style={{
      position: 'fixed', bottom: 32, left: '50%',
      transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(14px)',
      opacity: visible ? 1 : 0,
      background: bg, color: '#fff',
      padding: '12px 22px', borderRadius: 10,
      fontSize: '.74rem', fontWeight: 600, zIndex: 999,
      whiteSpace: 'nowrap',
      boxShadow: '0 8px 24px rgba(14,14,20,.22)',
      transition: 'opacity .25s, transform .25s cubic-bezier(.2,.8,.2,1)',
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  )
}

/** Simple hook: useToast() → { show, ToastEl } */
export function useToast() {
  const [state, setState] = useState<{ msg: string; type: ToastType; key: number } | null>(null)

  function show(msg: string, type: ToastType = 'default') {
    setState({ msg, type, key: Date.now() })
  }

  const ToastEl = state ? (
    <Toast key={state.key} message={state.msg} type={state.type} onDone={() => setState(null)} />
  ) : null

  return { show, ToastEl }
}
