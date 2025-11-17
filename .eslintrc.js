module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    '@eslint/js'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    'indent': ['error', 2],
    'linebreak-style': ['error', 'unix'],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'no-unused-vars': 'warn',
    'no-console': 'warn',
    'eqeqeq': 'error',
    'curly': ['error', 'all'],
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    'no-dupe-keys': 'error',
    'no-empty': 'warn',
    'no-undef': 'error'
  },
  globals: {
    Fuse: 'readonly',
    DOMPurify: 'readonly'
  }
};
