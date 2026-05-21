import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
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

      // 🔴 CRITICAL: Dead code removal
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],

      // 🔴 CRITICAL: Prevent unsafe typing
      "@typescript-eslint/no-explicit-any": "error",

      // ✅ Ensure proper async handling
      "@typescript-eslint/no-floating-promises": "error",

      // ✅ Force explicit return types (better maintainability)
      "@typescript-eslint/explicit-function-return-type": "warn",

      // ✅ Better safety
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        { "ts-ignore": "allow-with-description" }
      ],

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
