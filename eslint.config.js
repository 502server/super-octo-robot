import js from "@eslint/js";
import globals from "globals";

const qualityRules = {
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-var": "error",
  "prefer-const": "error",
  "no-debugger": "error",
  "no-unused-vars": [
    "error",
    { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" },
  ],
};

export default [
  {
    ignores: ["node_modules/**", "coverage/**", "data/**"],
  },
  {
    ...js.configs.recommended,
    files: ["eslint.config.js", "api/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: qualityRules,
  },
  {
    ...js.configs.recommended,
    files: ["web/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: qualityRules,
  },
];
