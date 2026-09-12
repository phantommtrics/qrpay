import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

type OtpInputProps = {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  error?: boolean
  autoFocus?: boolean
}

export type OtpInputRef = {
  focus: () => void
  blur: () => void
}

export const OtpInput = forwardRef<OtpInputRef, OtpInputProps>(function OtpInput(
  { length = 6, value, onChange, onComplete, disabled, error, autoFocus },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const prevLength = useRef(0)
  const [focused, setFocused] = useState(false)

  const digits = value.padEnd(length, ' ').split('').slice(0, length)
  const activeIndex = Math.min(value.length, length - 1)

  const focusInput = useCallback(() => {
    if (disabled) return
    inputRef.current?.focus()
  }, [disabled])

  useImperativeHandle(ref, () => ({
    focus: focusInput,
    blur: () => inputRef.current?.blur(),
  }))

  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(focusInput, 350)
    return () => window.clearTimeout(timer)
  }, [autoFocus, focusInput])

  useEffect(() => {
    if (value.length === length && prevLength.current < length) {
      onComplete?.(value)
    }
    prevLength.current = value.length
  }, [value, length, onComplete])

  const handleChange = (text: string) => {
    onChange(text.replace(/\D/g, '').slice(0, length))
  }

  return (
    <div
      role="group"
      onClick={focusInput}
      className={`relative w-full ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'}`}
      aria-label="One-time code input"
    >
      <div className="pointer-events-none flex w-full gap-2" aria-hidden="true">
        {digits.map((digit, index) => {
          const isActive = focused && index === activeIndex && value.length < length
          const isFilled = digit.trim().length > 0

          return (
            <div
              key={index}
              className={[
                'flex h-14 min-w-10 max-w-[52px] flex-1 items-center justify-center rounded-2xl border-2 bg-white transition',
                error
                  ? 'border-red-500 bg-red-50'
                  : isActive
                    ? 'scale-[1.04] border-teal-500 bg-teal-50'
                    : isFilled
                      ? 'border-teal-500 bg-white'
                      : 'border-slate-200 bg-white',
              ].join(' ')}
            >
              {isFilled ? (
                <span className="text-2xl font-bold text-slate-900">{digit}</span>
              ) : isActive ? (
                <span className="h-6 w-0.5 animate-pulse rounded-sm bg-teal-600" />
              ) : null}
            </div>
          )
        })}
      </div>

      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text text-transparent caret-transparent outline-none opacity-[0.02]"
        aria-label="Enter verification code"
      />
    </div>
  )
})
