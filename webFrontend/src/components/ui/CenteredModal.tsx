import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export function CenteredModal({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
