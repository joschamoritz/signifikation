// ESLint Flat Config — Fokus auf Korrektheit, nicht Stil.
// Formatierung bleibt bewusst ungeregelt (kein Prettier-Massenformat,
// um git blame nicht zu verschmutzen).
import js from '@eslint/js'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'coverage/**',
      'dev-dist/**',
      'server/public/**', // gebundelte Admin-Assets (Chart.js etc.)
      'playwright-report/**',
      'test-results/**',
      'wortprofil/**', // Python-Pipeline + venv – kein Projekt-JS
      '.claude/**',    // Claude Code Worktrees – nur lokal, nicht in CI
      'design/**',     // lokale Design-Prototypen (untracked) – nicht Teil der App
    ],
  },
  js.configs.recommended,
  // Serverseitiger Code + Build-/Ops-Skripte (Node ESM)
  {
    files: ['server/**/*.{js,mjs}', 'shared/**/*.js', 'scripts/**/*.{js,mjs}', '*.js', '*.cjs', 'e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Leere catch-Bloecke sind hier bewusstes Muster (best-effort Cleanup,
      // Capacitor-Plugin-Aufrufe, localStorage in Private Mode etc.)
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  // Frontend (Browser + React)
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly', // vite define
        __BUILD_DATE__: 'readonly', // vite define
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // JSX-Runtime (React 18 + Vite): kein React-Import nötig
      'react/react-in-jsx-scope': 'off',
      // Kein PropTypes-Einsatz im Projekt
      'react/prop-types': 'off',
      // Deutsche UI-Texte enthalten Anfuehrungszeichen/Apostrophe im JSX
      'react/no-unescaped-entities': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Kern-Regel bleibt Error (haette den Quiz.jsx-Bug gefunden):
      'react-hooks/rules-of-hooks': 'error',
      // Neue opinionated Regeln aus react-hooks v6 (Compiler-Vorbereitung):
      // echte Smells, aber Bestandscode — als Warnungen sichtbar halten,
      // schrittweise abbauen (siehe planning/2026-06-11-umsetzungsplan.md).
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  // Service Worker
  {
    files: ['src/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  // Tests (Vitest-Globals werden nicht genutzt — explizite Imports —, aber
  // Node-Globals und entspanntere Regeln für Fixtures/Mocks)
  {
    files: ['**/*.test.{js,jsx}', 'vitest.setup.js', 'vitest.global-setup.js', 'server/__tests__/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
]
