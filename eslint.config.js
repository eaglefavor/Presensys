import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '**/*.orig']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
    },
  },
])

/**
 * DARK MODE REMINDER:
 *
 * When adding new UI components or modifying styles:
 * 1. NEVER use hardcoded colors (e.g., '#ffffff', '#333333', 'rgba(0,0,0,0.4)')
 * 2. ALWAYS use CSS variables from src/index.css (e.g., 'var(--text-dark)', 'var(--soft-white)')
 * 3. Import and use ThemeColors utilities from src/lib/themeColors.ts for semantic colors
 * 4. Test your changes in both light and dark modes
 *
 * See DARK_MODE.md for comprehensive guidelines and examples.
 *
 * Dark mode CSS variables automatically respond to :root.dark-mode class changes.
 * This ensures all UI changes made by AI agents or developers are instantly compatible
 * with dark mode without requiring separate modifications.
 */
