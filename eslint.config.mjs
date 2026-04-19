import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const sharedRules = {
  ...tseslint.configs.recommended.rules,
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
};

const sharedPlugins = { "@typescript-eslint": tseslint };

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.json" },
    },
    plugins: sharedPlugins,
    rules: sharedRules,
  },
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: "./tsconfig.scripts.json" },
    },
    plugins: sharedPlugins,
    rules: sharedRules,
  },
];
