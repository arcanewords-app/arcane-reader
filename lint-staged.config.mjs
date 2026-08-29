/** @type {import('lint-staged').Configuration} */
export default {
  'src/**/*.{ts,tsx}': [
    'prettier --write',
    'oxlint --fix',
    () => 'npm run check:circular',
  ],
  'src/**/*.css': ['prettier --write', 'stylelint --fix'],
  'scripts/**/*.{ts,js,mjs,cjs}': ['prettier --write', 'oxlint --fix'],
  'docs/**/*.{md,json}': 'prettier --write',
  '*.{json,md,yml,yaml}': 'prettier --write',
};
