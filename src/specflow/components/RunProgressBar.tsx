import type { ChainRun } from '../types'

type RunProgressBarProps = {
  pct: number
  statusClass: string
  rightText?: string
  className?: string
}

export function getChainRunStatusClass(status: ChainRun['status']) {
  return status === 'completed'
    ? 'sfChainMgrStatusDone'
    : status === 'cancelled'
      ? 'sfChainMgrStatusCancelled'
      : status === 'error'
        ? 'sfChainMgrStatusError'
        : 'sfChainMgrStatusRunning'
}

export function getChainRunProgress(run: ChainRun) {
  const total = run.nodeIds.length
  const done = run.completedNodeIds.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const statusClass = getChainRunStatusClass(run.status)
  return { pct, statusClass, rightText: `${done}/${total} nodes` }
}

export function RunProgressBar({ pct, statusClass, rightText, className }: RunProgressBarProps) {
  const safePct = Math.max(0, Math.min(100, pct))
  const rowClassName = ['sfChainMgrProgressRow', className].filter(Boolean).join(' ')

  return (
    <div className={rowClassName}>
      <div className="sfChainMgrBar">
        <div className={`sfChainMgrBarFill ${statusClass}`} style={{ width: `${safePct}%` }} />
      </div>
      {rightText ? <div className="sfChainMgrProgressText">{rightText}</div> : null}
    </div>
  )
}
