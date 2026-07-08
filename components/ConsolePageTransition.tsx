'use client'
import { usePathname } from 'next/navigation'

/** Wraps the right-side content area of a console page with a route-keyed animation */
export default function ConsoleMain({ children, style }: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const path = usePathname()
  return (
    <div key={path} className="page-anim mb-field-bg" style={{ flex: 1, marginLeft: 230, ...style }}>
      {children}
    </div>
  )
}
