import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ESLint 配置：用于约束 TS/TSX 代码质量与 React 相关规则。
export default defineConfig([
  // 忽略构建产物目录。
  globalIgnores(['dist']),
  {
    // 仅校验 TypeScript 与 TSX 文件。
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      // 使用现代 ECMAScript 语法与浏览器全局变量集合。
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
