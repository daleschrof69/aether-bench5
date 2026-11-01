// ESLint v9 flat config — used by the global `eslint` CLI.
// Note: CRA (react-scripts) ships its own ESLint pipeline internally and ignores
// this file; this config is only consumed by ad-hoc CLI invocations.

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default [
  { ignores: ["build/**", "node_modules/**", "public/**", "**/*.config.js"] },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React 17+ new JSX transform — no need to import React in scope
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Apostrophes/quotes in JSX text are fine; this rule is style-only noise
      "react/no-unescaped-entities": "off",
      // Allow unused vars that begin with _ (common convention)
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // cmdk and shadcn libraries use custom kebab-case data attributes
      "react/no-unknown-property": [
        "error",
        { ignore: ["data-testid", "data-debug-wrapper", "cmdk-input-wrapper"] },
      ],
    },
  },
  {
    // Shadcn UI components are vendored as-is; relax rules here.
    files: ["src/components/ui/**/*.{js,jsx}", "src/hooks/use-toast.js"],
    rules: {
      "no-unused-vars": "off",
    },
  },
];
