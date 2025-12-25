import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  // 1. Setup for all files (base)
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'warn',
      'no-console': 'off',
    },
  },
  // 2. Setup for TS files (Type Checked)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked, prettierConfig],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  // 3. Setup for JS files (No Type Checking)
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, prettierConfig],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  // 4. Server/Core isolation (No DOM)
  {
    files: ['src/core/**/*.ts', 'src/server/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: {
      globals: {
        // Explicitly disable browser globals that might be auto-detected or merged
        window: false,
        document: false,
        navigator: false,
        HTMLElement: false,
        console: true, // We allow console
      },
    },
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: 'Do not use window in core/server code. This code must run in Node.js.',
        },
        {
          name: 'document',
          message: 'Do not use document in core/server code. This code must run in Node.js.',
        },
        {
          name: 'navigator',
          message: 'Do not use navigator in core/server code. This code must run in Node.js.',
        },
      ],
    },
  },
);
