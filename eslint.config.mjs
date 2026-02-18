import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
const myrules = {
  ...pluginJs.configs.recommended.rules,
  ...tseslint.configs.recommended.rules,
  '@typescript-eslint/ban-ts-comment': 'off', // Allow @ts-ignore comments
  '@typescript-eslint/no-floating-promises': 'error', // Ensure promises are handled
  '@typescript-eslint/no-explicit-any': 'warn', // Allow any type for flexibility
  '@typescript-eslint/no-unused-vars': 'warn',
};

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['src/extension/**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './src/extension/tsconfig.json', // Server tsconfig.json
      },
      globals: { ...globals.node, NodeJS: true },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...myrules,
    },
  },
  {
    files: [
      'src/dashboard/**/*.{js,mjs,cjs,ts}',
      'src/graphics/**/*.{js,mjs,cjs,ts}',
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './src/dashboard/tsconfig.json', // Browser tsconfig.json
      },
      globals: { ...globals.browser },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...myrules,
    },
  },
];
