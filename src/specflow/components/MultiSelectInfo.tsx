import { useEffect, useRef, useState } from 'react'

type Props = {
  count: number
  primaryTitle?: string
  onCopy: () => void
  onArchive: () => void
  onDelete: () => void
  onLayout: (layoutType: 'vertical-stack' | 'compact-stack' | 'horizontal-stack') => void
}

export function MultiSelectInfo({ count, primaryTitle, onCopy, onArchive, onDelete, onLayout }: Props) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLayoutMenuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsLayoutMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [isLayoutMenuOpen])

  return (
    <div className="sfMultiSelectInfo">
      <div className="sfMultiSelectHeader">
        <span className="sfMultiSelectCount">{count}</span>
        <span className="sfMultiSelectLabel">nodes selected</span>
      </div>
      {primaryTitle && <div className="sfMultiSelectPrimary">Primary: {primaryTitle}</div>}
      <div className="sfMultiSelectActions">
        <button onClick={onCopy}>Copy</button>
        <button onClick={onArchive}>Archive</button>
        <div className="sfLayoutButtonWrapper" ref={menuRef}>
          <button onClick={() => setIsLayoutMenuOpen((v) => !v)}>Quick Layout ▾</button>
          {isLayoutMenuOpen && (
            <div className="sfLayoutMenu">
              <button
                className="sfLayoutMenuItem"
                onClick={() => {
                  onLayout('vertical-stack')
                  setIsLayoutMenuOpen(false)
                }}
              >
                Vertical Stack
              </button>
              <button
                className="sfLayoutMenuItem"
                onClick={() => {
                  onLayout('compact-stack')
                  setIsLayoutMenuOpen(false)
                }}
              >
                Compact Stack
              </button>
            </div>
          )}
        </div>
        <button onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
