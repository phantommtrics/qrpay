import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export function PageTransition({
  children,
  className = '',
  withSlide = false,
}: {
  children: ReactNode
  className?: string
  withSlide?: boolean
}) {
  return (
    <motion.div
      initial={withSlide ? { opacity: 0, y: 20 } : { opacity: 0 }}
      animate={withSlide ? { opacity: 1, y: 0 } : { opacity: 1 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
