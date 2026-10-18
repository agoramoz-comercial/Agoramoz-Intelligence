/** Ligações da base de dados de teste (recriada em cada execução). */
export const TEST_DB = process.env.TEST_DATABASE_NAME ?? 'agoramoz_hr_test'
const host = process.env.TEST_DATABASE_HOST ?? '127.0.0.1:5432'
const adminUser = process.env.TEST_DATABASE_ADMIN_USER ?? 'postgres'
const adminPassword = process.env.TEST_DATABASE_ADMIN_PASSWORD ?? 'postgres'

export const TEST_ADMIN_URL = `postgres://${adminUser}:${adminPassword}@${host}/${TEST_DB}`
/** O papel agoramoz_app é do cluster: os testes usam a mesma credencial do ambiente local (.env.example). */
export const TEST_APP_PASSWORD = process.env.TEST_DATABASE_APP_PASSWORD ?? 'agoramoz_app_dev'
export const TEST_APP_URL = `postgres://agoramoz_app:${encodeURIComponent(TEST_APP_PASSWORD)}@${host}/${TEST_DB}`
