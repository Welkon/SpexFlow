import { useMemo, useState } from 'react'
import type { ChainRun } from './types'

export function ChainManager(props: {
  runs: ChainRun[]
  onCancel: (id: string) => void
  tabNameById?: Map<string, string>
}) {
  const [expanded, setExpanded] = useState(true)

  const runningCount = useMemo(
    () => props.runs.filter((r) => r.status === 'running').length,
    [props.runs],
  )

  if (props.runs.length === 0) return null

  return (
    <div className="sfChainMgr">
      <button
        className="sfChainMgrHeader"
        onClick={() => setExpanded((x) => !x)}
      >
        <span className="sfChainMgrArrow">{expanded ? '▼' : '►'}</span>
        <span className="sfChainMgrTitle">Chain Manager</span>
        <span className="sfChainMgrCount">({runningCount} running)</span>
      </button>

      {expanded ? (
        <div className="sfChainMgrBody">
          {props.runs.map((r) => {
            const total = r.nodeIds.length
            const done = r.completedNodeIds.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const tabName = props.tabNameById?.get(r.tabId)
            const statusClass =
              r.status === 'completed'
                ? 'sfChainMgrStatusDone'
                : r.status === 'cancelled'
                  ? 'sfChainMgrStatusCancelled'
                  : r.status === 'error'
                    ? 'sfChainMgrStatusError'
                    : 'sfChainMgrStatusRunning'

            return (
              <div key={r.id} className="sfChainMgrItem">
                <div className="sfChainMgrItemTitle">
                  Chain from “{r.fromNodeTitle || r.fromNodeId}”
                </div>
                {tabName ? <div className="sfChainMgrItemSub">Tab: {tabName}</div> : null}
                <div className="sfChainMgrProgressRow">
                  <div className="sfChainMgrBar">
                    <div
                      className={`sfChainMgrBarFill ${statusClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="sfChainMgrProgressText">
                    {done}/{total} nodes
                  </div>
                </div>
                <div className="sfChainMgrActions">
                  {r.status === 'running' ? (
                    <button
                      className="sfChainMgrCancel"
                      onClick={() => props.onCancel(r.id)}
                    >
                      Cancel
                    </button>
                  ) : (
                    <div className="sfChainMgrStatusLabel">{r.status}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
