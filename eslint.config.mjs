// ESLint flat config. Kept dependency-light: @eslint/js + typescript-eslint,
// with rules tuned so the existing codebase lints clean.
import js from "@eslint/js"
import tseslint from "typescript-eslint"
import globals from "globals"

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "models/**",
      "sim-out/**",
      "kokoro/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // The codebase uses `any` deliberately in a few narrow spots (log args,
      // parsed JSON from external services).
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Plain-JS config files use CommonJS.
    files: ["*.js"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
)
