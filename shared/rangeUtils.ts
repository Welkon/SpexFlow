export type LineRange = [number, number]

function isRangeEndInfinite(end: number) {
  return end === -1
}

/**
 * Merge overlapping or adjacent line ranges for a single file.
 * Input: [[1,10], [5,15], [20,25], [24,30]]
 * Output: [[1,15], [20,30]]
 */
export function mergeRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return []

  const sorted = [...ranges].sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0]
    const aEnd = isRangeEndInfinite(a[1]) ? Number.POSITIVE_INFINITY : a[1]
    const bEnd = isRangeEndInfinite(b[1]) ? Number.POSITIVE_INFINITY : b[1]
    return bEnd - aEnd
  })

  const merged: LineRange[] = []

  for (const [start, end] of sorted) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`Invalid range: [${start}, ${end}]`)
    if (!isRangeEndInfinite(end) && end < start) throw new Error(`Invalid range (end < start): [${start}, ${end}]`)

    const last = merged[merged.length - 1]
    if (!last) {
      merged.push([start, end])
      continue
    }

    if (isRangeEndInfinite(last[1])) continue

    if (start <= last[1] + 1) {
      if (isRangeEndInfinite(end)) {
        last[1] = -1
      } else {
        last[1] = Math.max(last[1], end)
      }
      continue
    }

    merged.push([start, end])
  }

  return merged
}

/**
 * Merge multiple CodeSearchOutput `files` records into one deduplicated record.
 */
export function mergeCodeSearchOutputs(
  outputs: Array<{ files: Record<string, LineRange[]> }>,
): Record<string, LineRange[]> {
  const combined: Record<string, LineRange[]> = {}

  for (const output of outputs) {
    for (const [filePath, ranges] of Object.entries(output.files)) {
      if (!combined[filePath]) combined[filePath] = []
      combined[filePath].push(...ranges)
    }
  }

  const result: Record<string, LineRange[]> = {}
  for (const [filePath, ranges] of Object.entries(combined)) {
    result[filePath] = mergeRanges(ranges)
  }

  return result
}

