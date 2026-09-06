import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

export default function PanelMotion({ children, className = '' }: { children: ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion()
  const hidden = { opacity: 0, y: reducedMotion ? 0 : 8 }
  return (
    <motion.div className={className} initial={hidden} animate={{ opacity: 1, y: 0 }} exit={hidden} transition={{ duration: 0.18, ease: 'easeOut' }}>
      {children}
    </motion.div>
  )
}
