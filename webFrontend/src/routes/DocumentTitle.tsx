import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { formatBrowserDocumentTitle } from '../config/navigation'

/** Syncs `document.title` to `EasyPay | <page>` on route change (HashRouter pathname). */
export function DocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = formatBrowserDocumentTitle(pathname)
  }, [pathname])

  return null
}
