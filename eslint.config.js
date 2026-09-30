import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import selo from "./eslint-rules/index.js";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "coverage/**", "apps/api/drizzle/**"],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    plugins: {
      selo,
    },
    rules: {
      "selo/no-comments": "error",
      "no-console": "error",
    },
  },
  {
    files: ["eslint.config.js", "eslint-rules/**/*.js", "**/*.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
