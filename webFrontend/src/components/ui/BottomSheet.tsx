import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export function BottomSheet({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
