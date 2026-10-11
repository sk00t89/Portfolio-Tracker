import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'performance-test/dist']),

  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
    },
  },

  {
    files: ['server/**/*.js', 'scripts/*LocalPerformance*.mjs', 'scripts/localPerformance*.mjs', 'scripts/*LocalHistory*.mjs', 'scripts/localHistory*.mjs', 'scripts/syntheticPortfolioFixtures.mjs', 'scripts/*LocalCsv*.mjs', 'scripts/*LocalImport*.mjs'],
    extends: [
      js.configs.recommended,
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
])
