import { readFileSync } from "node:fs"
import { join } from "node:path"

// Loads knowledge.md once and caches it. This is the ONLY set of facts the
// assistant is allowed to state about the business. Editing the file + restarting
// (or a fresh process) picks up changes.
let cached: string | null = null

export function getKnowledge(): string {
  if (cached !== null) return cached
  try {
    cached = readFileSync(join(process.cwd(), "knowledge.md"), "utf8").trim()
  } catch {
    cached = ""
  }
  return cached
}
