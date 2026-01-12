import { useCallback, useRef } from 'react'
import type { MouseEvent } from 'react'

export function useModalBackdropClose(onClose: () => void) {
  const mouseDownInsideRef = useRef(false)

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (mouseDownInsideRef.current) {
        mouseDownInsideRef.current = false
        return
      }
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  const contentMouseHandlers = {
    onMouseDown: () => {
      mouseDownInsideRef.current = true
    },
    onMouseUp: () => {
      mouseDownInsideRef.current = false
    },
  }

  return { handleBackdropClick, contentMouseHandlers }
}
