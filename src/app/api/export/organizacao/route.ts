import { authorize } from '@/server/auth/current'
import { download } from '@/server/http/download'
import { exportOrganization } from '@/modules/privacy/service'

export async function GET() {
  return download(async () => {
    const { filename, zip } = await exportOrganization(await authorize('data.export'))
    return { body: new Uint8Array(zip), filename, contentType: 'application/zip' }
  })
}
