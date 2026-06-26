import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, dirname, resolve } from 'node:path'

// Repo root is one level above this file (src/)
const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..')

/** Recursively collect .ts/.tsx files, excluding tests and declaration files. */
function scanFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...scanFiles(full))
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\.(ts|tsx)$/.test(entry) &&
      !/\.d\.ts$/.test(entry)
    ) {
      files.push(full)
    }
  }
  return files
}

/**
 * Files allowed to import @supabase/supabase-js or lib/supabase.
 * Paths are relative to the repo root.
 */
const ALLOWLIST = new Set([
  'src/lib/supabase.ts',        // defines the client
  'src/lib/hooks/useSession.ts', // auth carve-out
  'src/app/LoginPage.tsx',       // auth carve-out
])

function isAllowed(relPath: string): boolean {
  if (ALLOWLIST.has(relPath)) return true
  // Anything under src/data/ is allowed
  if (relPath.startsWith('src/data/')) return true
  return false
}

/** Returns true if the file content contains a supabase import that should be guarded. */
function hasSupabaseImport(content: string): boolean {
  // Direct import from the npm package
  if (/@supabase\/supabase-js/.test(content)) return true
  // Import of the singleton client (any relative or alias path ending in lib/supabase)
  if (/from ['"][^'"]*lib\/supabase['"]/.test(content)) return true
  return false
}

describe('architecture', () => {
  it('@supabase/supabase-js and the supabase client are used only in src/lib/supabase.ts, src/data/, and auth carve-outs', () => {
    const srcDir = join(ROOT, 'src')
    const files = scanFiles(srcDir)

    const offenders = files
      .filter(f => {
        const rel = relative(ROOT, f)
        return !isAllowed(rel) && hasSupabaseImport(readFileSync(f, 'utf8'))
      })
      .map(f => relative(ROOT, f))

    expect(
      offenders,
      `Files violating the data/ boundary: ${offenders.join(', ')}`
    ).toEqual([])
  })
})
