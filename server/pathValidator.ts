import { stat } from 'node:fs/promises'
import path from 'node:path'

export type PathValidationResult = {
  valid: string[]
  invalid: string[]
}

/**
 * Validates that all file paths exist relative to the repository root.
 *
 * @param repoRoot - Absolute path to the repository root directory
 * @param filePaths - Array of file paths to validate (relative to repo root)
 * @returns Object containing arrays of valid and invalid paths
 */
export async function validateFilePaths(
  repoRoot: string,
  filePaths: string[],
): Promise<PathValidationResult> {
  const normalizedRoot = path.resolve(repoRoot)
  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        if (path.isAbsolute(filePath)) return { path: filePath, exists: false }

        const resolved = path.resolve(normalizedRoot, filePath)
        const relative = path.relative(normalizedRoot, resolved)

        // @@@path-escape-check - ensure resolved paths stay within the repo root
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
          return { path: filePath, exists: false }
        }

        const stats = await stat(resolved)
        return { path: filePath, exists: stats.isFile() }
      } catch {
        return { path: filePath, exists: false }
      }
    }),
  )

  return {
    valid: results.filter((r) => r.exists).map((r) => r.path),
    invalid: results.filter((r) => !r.exists).map((r) => r.path),
  }
}

/**
 * Formats a feedback message for the agent when invalid paths are detected.
 */
export function formatPathValidationFeedback(invalidPaths: string[]): string {
  const pathList = invalidPaths.map((p) => `  - "${p}"`).join('\n')
  return `ERROR: The following file paths you provided do not exist in the repository:

${pathList}

Please correct your response. Double-check the exact file paths by:
1. Verifying the directory structure exists
2. Checking for typos in file names
3. Ensuring you're using the correct file extensions
4. Using paths relative to the repository root

Provide a corrected list of files with valid paths only.`
}
