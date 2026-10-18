import next from 'eslint-config-next'

const config = [
  ...next,
  {
    ignores: ['.next/**', 'node_modules/**', '.taste-skill/**', 'storage/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
]

export default config
