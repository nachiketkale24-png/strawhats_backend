import type { ReactNode } from 'react'

interface Props { children: ReactNode; className?: string }

export default function Panel({ children, className = '' }: Props) {
  return <div className={`hud-panel p-4 ${className}`}>{children}</div>
}

export function PanelLabel({ children, className = '' }: Props) {
  return <h2 className={`hud-label ${className}`}>{children}</h2>
}

export function PanelValue({ children, className = '' }: Props) {
  return <p className={`font-[family-name:var(--font-hud)] text-3xl font-bold text-[var(--cyan-primary)] ${className}`}>{children}</p>
}

export function PanelCaption({ children, className = '' }: Props) {
  return <p className={`text-xs leading-relaxed text-[var(--text-secondary)] ${className}`}>{children}</p>
}
