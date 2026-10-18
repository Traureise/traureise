import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".secrets/**", ".playwright-mcp/**", "docs/superpowers/**", ".next/**", "dist/**", "node_modules/**", "test-results/**", "playwright-report/**", "next-env.d.ts", "site/**", ".cache/**"],
  },
  {
    // Every user-facing string lives in messages/*.json (German-first i18n).
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true, ignoreProps: true, allowedStrings: ["·", "|", "–", "—", "&", "#", "/", ":", "×", "%"] }],
    },
  },
  {
    // Inner layers must not depend on outer ones.
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/application/*", "@/infrastructure/*", "@/app/*", "@/components/*", "next/*", "react", "drizzle-orm*"] }],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["@/infrastructure/*", "@/app/*", "@/components/*", "next/*", "react", "drizzle-orm*"] }],
    },
  },
];

export default config;
