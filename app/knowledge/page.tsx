import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { KnowledgeEditor } from "@/components/knowledge-editor"

export const dynamic = "force-dynamic"

export default async function KnowledgePage() {
  let content = ""
  try {
    content = await readFile(join(process.cwd(), "knowledge.md"), "utf8")
  } catch {
    /* file may not exist yet */
  }
  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Knowledge base</h1>
      <p className="text-neutral-500 text-sm mb-6">
        The <strong>only</strong> facts the assistant may state about the business. Anything not
        here, it takes a message for. Saved edits apply on the next call — no restart.
      </p>
      <KnowledgeEditor initial={content} />
    </div>
  )
}
