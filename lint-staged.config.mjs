/** @type {import('lint-staged').Configuration} */
export default {
  'src/**/*.{ts,tsx}': [
    'prettier --write',
    'eslint --fix',
    () => 'npm run check:circular',
  ],
  'src/**/*.css': ['prettier --write', 'stylelint --fix'],
  'scripts/**/*.{ts,js,mjs,cjs}': ['prettier --write', 'eslint --fix'],
  'docs/**/*.{md,json}': 'prettier --write',
  '*.{json,md,yml,yaml}': 'prettier --write',
};
