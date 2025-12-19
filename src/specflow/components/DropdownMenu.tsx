import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  trigger: React.ReactNode
  items: Array<{ label: string; onClick: () => void }>
}

export function DropdownMenu({ trigger, items }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    function updatePos() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuPos({ top: rect.bottom + 4, left: rect.left })
    }

    // @@@dropdown-portal - tab bar uses overflow scrolling; portal avoids clipping the menu
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [isOpen])

  return (
    <div className="sfDropdown" ref={triggerRef}>
      <div onClick={() => setIsOpen((v) => !v)}>{trigger}</div>
      {isOpen && menuPos
        ? createPortal(
            <div className="sfDropdownMenu" ref={menuRef} style={{ top: menuPos.top, left: menuPos.left }}>
              {items.map((item, i) => (
                <button
                  key={i}
                  className="sfDropdownItem"
                  onClick={() => {
                    item.onClick()
                    setIsOpen(false)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
