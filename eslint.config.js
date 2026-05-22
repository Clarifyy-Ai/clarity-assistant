import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "supabase/functions/**", "electron/**", "scripts/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],

    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,

      // ✅ React / Fast Refresh
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ⚠️ Dead code — warn only (bulk removal risks behavior changes per guardrail)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "prefer-const": "warn",
      "no-useless-catch": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "no-control-regex": "warn",

      // ⚠️ Allowed but flagged — project convention permits `as any` in Supabase helpers (see memory)
      "@typescript-eslint/no-explicit-any": "warn",

      // ⚠️ Flag floating promises but don't block build
      "@typescript-eslint/no-floating-promises": "warn",

      // ⛔ Disabled — project convention is inferred return types
      "@typescript-eslint/explicit-function-return-type": "off",

      // ⚠️ Pre-existing @ts-nocheck directives are out of scope
      "@typescript-eslint/ban-ts-comment": "off",

      // Allow empty catch blocks (common pattern for best-effort cleanup)
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Stray escapes in regex strings — warn only
      "no-useless-escape": "warn",

      // 🔐 SECURITY RULES
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // ✅ Debug prevention
      "no-debugger": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }]
    },
  }
);
