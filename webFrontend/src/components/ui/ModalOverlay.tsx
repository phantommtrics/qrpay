import { motion } from 'framer-motion'

export function ModalOverlay({
  onClick,
  className = '',
}: {
  onClick?: () => void
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={className}
      onClick={onClick}
    />
  )
}
