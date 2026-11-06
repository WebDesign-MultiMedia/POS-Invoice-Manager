import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", "coverage/", "node_modules/"] },
  js.configs.recommended,

  // Browser app (React)
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The app is plain JavaScript without PropTypes.
      "react/prop-types": "off",
      // Copy text uses real apostrophes and quotes.
      "react/no-unescaped-entities": "off",
    },
  },

  // Serverless functions, scripts and config files (Node)
  {
    files: ["api/**/*.js", "scripts/**/*.js", "*.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
  },

  // Tests
  {
    files: ["**/*.test.{js,jsx}", "test/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Leading-underscore variables are intentionally unused (e.g. destructuring
  // fields out of an object).
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
