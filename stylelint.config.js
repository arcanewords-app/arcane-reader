/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['node_modules/', 'dist/', '**/*.min.css'],
  rules: {
    'selector-class-pattern': null,
    'color-function-notation': null,
    'alpha-value-notation': null,
    'rule-empty-line-before': null,
    'media-feature-range-notation': null,
    'import-notation': null,
    'shorthand-property-no-redundant-values': null,
    'no-descending-specificity': null,
    'comment-empty-line-before': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'property-no-vendor-prefix': null,
    'selector-no-vendor-prefix': null,
    'color-hex-length': null,
    'value-keyword-case': null,
    'no-duplicate-selectors': null,
  },
};
