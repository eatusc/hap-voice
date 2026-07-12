import { getSettings } from "@/lib/settings"
import { getRetellStatus } from "@/lib/retell"
import { SettingsForm } from "@/components/settings-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const [settings, retell] = await Promise.all([getSettings(), getRetellStatus()])
  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Settings</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Changes apply live on the next call — no restart. Secrets (API keys) stay in{" "}
        <code className="text-neutral-400">.env.local</code>.
      </p>
      <SettingsForm initial={settings} retell={retell} />
    </div>
  )
}
