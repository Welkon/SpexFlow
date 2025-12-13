import { useCallback, useRef } from 'react'
import type { Edge } from '@xyflow/react'
import type { AppData, AppNode } from '../types'
import type { Selected } from './useAppData'
import { deepClone, getActiveTab, resetNodeRuntimeForPaste, uid } from '../utils'

type ClipboardData = {
  nodes: AppNode[]
  edges: Edge[]
  sourceTabId: string  // Track which tab the nodes came from
}

export function useClipboard(
  appDataRef: React.RefObject<AppData>,
  selectedRef: React.RefObject<Selected>,
  setAppData: React.Dispatch<React.SetStateAction<AppData>>,
  setSelected: React.Dispatch<React.SetStateAction<Selected>>,
) {
  const clipboardRef = useRef<ClipboardData | null>(null)
  const pasteSerial = useRef(0)

  const copySelectedNodes = useCallback(() => {
    const sel = selectedRef.current
    if (!sel || sel.nodeIds.length === 0) return

    const snap = getActiveTab(appDataRef.current)
    const selectedSet = new Set(sel.nodeIds)
    const nodes = snap.canvas.nodes.filter((n) => selectedSet.has(n.id))
    const edges = snap.canvas.edges.filter(
      (e) => selectedSet.has(e.source) && selectedSet.has(e.target),
    )
    clipboardRef.current = {
      nodes: deepClone(nodes),
      edges: deepClone(edges),
      sourceTabId: appDataRef.current.activeTabId!,
    }
  }, [appDataRef, selectedRef])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.nodes.length === 0) return

    const activeTab = getActiveTab(appDataRef.current)
    const isCrossCanvas = clip.sourceTabId !== activeTab.id

    pasteSerial.current += 1
    const idMap = new Map<string, string>()

    // Calculate the bounding box center of copied nodes
    const minX = Math.min(...clip.nodes.map((n) => n.position.x))
    const minY = Math.min(...clip.nodes.map((n) => n.position.y))
    const maxX = Math.max(...clip.nodes.map((n) => n.position.x))
    const maxY = Math.max(...clip.nodes.map((n) => n.position.y))
    const clipCenterX = (minX + maxX) / 2
    const clipCenterY = (minY + maxY) / 2

    // For cross-canvas paste: place nodes at viewport center
    // For same-canvas paste: offset from original position
    const viewport = activeTab.canvas.viewport ?? { x: 0, y: 0, zoom: 1 }
    const viewportCenterX = -viewport.x / viewport.zoom + 400 / viewport.zoom  // Approximate canvas center
    const viewportCenterY = -viewport.y / viewport.zoom + 300 / viewport.zoom

    const delta = 40 + (pasteSerial.current % 6) * 10

    const newNodes = clip.nodes.map((n) => {
      const newId = uid('n')
      idMap.set(n.id, newId)
      const cloned = resetNodeRuntimeForPaste(deepClone(n))

      let newPosition
      if (isCrossCanvas) {
        // Cross-canvas: position relative to viewport center
        const offsetX = n.position.x - clipCenterX
        const offsetY = n.position.y - clipCenterY
        newPosition = {
          x: viewportCenterX + offsetX + delta,
          y: viewportCenterY + offsetY + delta,
        }
      } else {
        // Same canvas: just offset from original
        newPosition = {
          x: cloned.position.x + delta,
          y: cloned.position.y + delta,
        }
      }

      return {
        ...cloned,
        id: newId,
        selected: true,
        position: newPosition,
      }
    })

    const newEdges = clip.edges.map((e) => {
      const source = idMap.get(e.source)
      const target = idMap.get(e.target)
      if (!source || !target) throw new Error('pasteClipboard: missing source/target remap')
      return { ...deepClone(e), id: uid('e'), source, target, selected: false }
    })

    setAppData((d) => {
      const activeId = d.activeTabId
      if (!activeId) return d
      return {
        ...d,
        tabs: d.tabs.map((t) =>
          t.id !== activeId
            ? t
            : {
                ...t,
                canvas: {
                  nodes: [...t.canvas.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
                  edges: [...t.canvas.edges.map((e) => ({ ...e, selected: false })), ...newEdges],
                  viewport: t.canvas.viewport,
                },
              },
        ),
      }
    })

    setSelected({ nodeIds: newNodes.map((n) => n.id), primaryId: newNodes[newNodes.length - 1].id })
  }, [appDataRef, setAppData, setSelected])

  return {
    copySelectedNodes,
    pasteClipboard,
  }
}
