import js from "@eslint/js";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  { ignores: ["dist", "node_modules", "playwright-report", "test-results"] },
  js.configs.recommended,
  { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tsparser, parserOptions: { sourceType: "module" }, globals: { ...globals.browser, ...globals.node } }, plugins: { "@typescript-eslint": tseslint }, rules: { "no-undef": "off", "no-unused-vars": "off", "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
];
