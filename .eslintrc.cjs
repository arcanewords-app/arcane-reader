/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // must be last: turns off rules that conflict with Prettier
  ],
  ignorePatterns: ['dist/', 'node_modules/', '*.cjs'],
  overrides: [
    {
      files: ['**/*.tsx'],
      env: { browser: true },
    },
  ],
};
