import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { Loader2, RefreshCcw, X } from 'lucide-react'

import { ModalOverlay } from '../ui/ModalOverlay'

function cameraErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return 'Camera permission was denied. Allow camera access in your browser settings and try again.'
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return 'No camera was found on this device.'
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return 'The camera is busy or unavailable. Close other apps using the camera and try again.'
    }
    if (err.name === 'OverconstrainedError') {
      return 'This camera cannot use the requested settings. Try switching cameras.'
    }
    if (err.name === 'SecurityError') {
      return 'Camera requires a secure connection (HTTPS), except on localhost.'
    }
  }
  return 'Could not access the camera. Check permissions and try again.'
}

function canUseCameraApi(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  const hasModernApi = Boolean(navigator.mediaDevices?.getUserMedia)
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: unknown
    mozGetUserMedia?: unknown
  }
  const hasLegacyApi =
    typeof nav.webkitGetUserMedia === 'function' || typeof nav.mozGetUserMedia === 'function'
  return hasModernApi || hasLegacyApi
}

function isCameraContextOk(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  if (window.isSecureContext) {
    return true
  }
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

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
  /** Kept for API compatibility; scanner always uses the framed modal. */
  minimalUI?: boolean
  allowCameraSwitch?: boolean
}) {
  void minimalUI

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined)

  const canSwitchCamera = allowCameraSwitch && videoDevices.length > 1

  const rotateCamera = () => {
    if (!canSwitchCamera || videoDevices.length < 2) {
      return
    }
    const idx = selectedDeviceId
      ? videoDevices.findIndex((device) => device.deviceId === selectedDeviceId)
      : 0
    const next = videoDevices[(idx + 1) % videoDevices.length]
    if (next) {
      setSelectedDeviceId(next.deviceId)
    }
  }

  useEffect(() => {
    if (!open) {
      setError(null)
      setStarting(false)
      setVideoDevices([])
      setSelectedDeviceId(undefined)
      return
    }

    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    let controls: { stop: () => void } | undefined

    const start = async () => {
      setError(null)
      setStarting(true)

      if (!isCameraContextOk()) {
        setError(
          'Camera is blocked on this connection. Open the site with HTTPS (or localhost) and allow camera permission.'
        )
        setStarting(false)
        return
      }

      if (!canUseCameraApi()) {
        setError('This browser does not support camera APIs (getUserMedia).')
        setStarting(false)
        return
      }

      try {
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        // Permission granted; stop preview stream — ZXing will open its own stream.
      } catch (e) {
        if (!cancelled) {
          setError(cameraErrorMessage(e))
        }
        setStarting(false)
        return
      }

      if (cancelled) {
        setStarting(false)
        return
      }

      let devices: MediaDeviceInfo[] = []
      try {
        devices = await BrowserMultiFormatReader.listVideoInputDevices()
      } catch {
        devices = []
      }

      if (cancelled) {
        setStarting(false)
        return
      }

      setVideoDevices(devices)

      const preferred =
        devices.find((d) => /(back|rear|environment)/i.test(d.label)) ?? devices[devices.length - 1]
      const deviceId = selectedDeviceId ?? preferred?.deviceId

      if (!deviceId) {
        setError('No camera was detected after permission was granted.')
        setStarting(false)
        return
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

      const videoEl = videoRef.current
      if (!videoEl || cancelled) {
        setStarting(false)
        return
      }

      try {
        controls = await reader.decodeFromVideoDevice(deviceId, videoEl, (result, decodeErr) => {
          if (cancelled) {
            return
          }
          if (result) {
            onDetectedRef.current(result.getText())
            return
          }
          if (decodeErr) {
            return
          }
        })
      } catch (e) {
        if (!cancelled) {
          setError(cameraErrorMessage(e))
        }
      } finally {
        if (!cancelled) {
          setStarting(false)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [open, selectedDeviceId])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <ModalOverlay className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
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

        <div className="relative mx-auto aspect-[4/3] w-full max-h-[min(55vh,420px)] bg-black">
          {starting ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
              <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
              <p className="px-4 text-center text-sm">Starting camera…</p>
            </div>
          ) : null}
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
          <div
            className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            aria-hidden
          />
        </div>

        <div className="border-t border-slate-100 px-4 py-3 text-center text-sm text-slate-600">
          {error ? <span className="text-red-600">{error}</span> : null}
          {!error && !starting ? (
            <span>Align the barcode inside the frame. It will scan automatically.</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
