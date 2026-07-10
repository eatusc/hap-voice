import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// The ONLY set of facts the assistant is allowed to state about the business.
// Cached, but keyed on the file's mtime so edits from the dashboard Knowledge
// editor (which rewrites knowledge.md) take effect on the next call — no restart.
let cache: { mtimeMs: number; content: string } | null = null

function knowledgePath(): string {
  return join(process.cwd(), "knowledge.md")
}

export function getKnowledge(): string {
  try {
    const mtimeMs = statSync(knowledgePath()).mtimeMs
    if (cache && cache.mtimeMs === mtimeMs) return cache.content
    const content = readFileSync(knowledgePath(), "utf8").trim()
    cache = { mtimeMs, content }
    return content
  } catch {
    return ""
  }
}
