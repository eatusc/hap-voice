// Side-effect module: loads .env / .env.local into process.env.
//
// This MUST be the very first import in any standalone entrypoint (server.ts,
// scripts/*) so the env is populated before lib/config.ts reads process.env.
// ES module imports are hoisted and evaluated in source order, so importing
// this first guarantees it runs before config is evaluated.
import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())
