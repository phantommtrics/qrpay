import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { RefreshCcw, X } from 'lucide-react'

import { ModalOverlay } from '../ui/ModalOverlay'

export function CameraBarcodeScanner({
  open,
  onClose,
  onDetected,
  title = 'Scan barcode',
  minimalUI = false,
  allowCameraSwitch = true,
}: {
  open: boolean
  onClose: () => void
  onDetected: (value: string) => void
  title?: string
  minimalUI?: boolean
  allowCameraSwitch?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined)

  const canSwitchCamera = allowCameraSwitch && videoDevices.length > 1

  const rotateCamera = () => {
    if (!canSwitchCamera || !selectedDeviceId) {
      return
    }
    const idx = videoDevices.findIndex((device) => device.deviceId === selectedDeviceId)
    const next = videoDevices[(idx + 1) % videoDevices.length]
    if (next) {
      setSelectedDeviceId(next.deviceId)
    }
  }

  useEffect(() => {
    if (!open || !videoRef.current) {
      return
    }

    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    let controls: { stop: () => void } | undefined

    const start = async () => {
      setError(null)
      try {
        controls = await reader.decodeFromVideoDevice(selectedDeviceId, videoRef.current!, (result, err) => {
          if (cancelled) {
            return
          }

          if (result) {
            onDetected(result.getText())
            return
          }

          if (err) {
            // Ignore frequent "not found" decode attempts while camera is searching.
            return
          }
        })
      } catch {
        setError('Camera access was blocked or unavailable on this device.')
      }
    }

    void start()

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onDetected, open, selectedDeviceId])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    const loadDevices = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (cancelled || devices.length === 0) {
          return
        }
        setVideoDevices(devices)

        const byLabel = devices.find((device) =>
          /(back|rear|environment)/i.test(device.label),
        )
        const fallback = devices[devices.length - 1]
        setSelectedDeviceId((byLabel ?? fallback)?.deviceId)
      } catch {
        // If listing devices fails, scanner still tries default camera.
      }
    }

    void loadDevices()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) {
    return null
  }

  if (minimalUI) {
    return (
      <div className="fixed inset-0 z-[70] bg-black">
        <ModalOverlay className="absolute inset-0 bg-black/80" onClick={onClose} />
        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-3 right-3 flex gap-2">
            {canSwitchCamera ? (
              <button
                type="button"
                onClick={rotateCamera}
                className="pointer-events-auto rounded-full bg-black/60 p-2 text-white"
                aria-label="Switch camera"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="pointer-events-auto rounded-full bg-black/60 p-2 text-white"
              aria-label="Close scanner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {error ? (
          <div className="absolute right-0 bottom-3 left-0 px-3 text-center text-xs text-red-300">
            {error}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <ModalOverlay className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <div className="flex items-center gap-2">
            {canSwitchCamera ? (
              <button
                type="button"
                onClick={rotateCamera}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Switch camera"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Close scanner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="bg-black p-2">
          <video
            ref={videoRef}
            className="max-h-[70vh] min-h-72 w-full rounded-lg object-cover"
            muted
            playsInline
          />
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
          {error ?? 'Point camera at barcode. We will auto-detect and continue.'}
        </div>
      </div>
    </div>
  )
}
