import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  { ignores: ["**/._*"] },
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {},
  },
  {
    files: ["packages/contracts/src/proof-ir.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./semantic-ir.js", "./semantic-ir"],
              message: "proof-ir must not import semantic-ir; use primitives.",
            },
          ],
        },
      ],
    },
  },
];
