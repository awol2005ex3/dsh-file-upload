/**
 * dsh-file-upload — Host (Node) entry.
 *
 * Registers:
 *   1. The host-side `fileUploads` service (from @deepseek-ai/dsh-client-file-upload)
 *      consumed by the Session controller.
 *   2. `POST /api/dsh-file-upload?path=<dir>&name=<filename>` — the exact Fetch
 *      route the browser upload button POSTs raw file bytes to. The official
 *      `/api/file` route only owns GET/HEAD, so uploads need this own route
 *      (reachable only by the authenticated owner peer).
 */
import { basename, isAbsolute, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { FileUploads } from '@deepseek-ai/dsh-client-file-upload'
import type { Context } from '@deepseek-ai/cordis'

/**
 * 本地最小声明 `ctx.connection`（等价于 @deepseek-ai/dsh-client-connection
 * 的 Context augmentation）。该包 npm 上版本与 harness peer 冲突装不上，
 * 这里只声明用到的 fetch.register 面。
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    connection: {
      fetch: {
        register(route: {
          readonly path: string
          readonly methods: readonly string[]
          readonly requestBody: 'buffered' | 'streaming'
          readonly fetch: (request: Request) => Promise<Response>
        }): () => Promise<void>
      }
    }
  }
}

/** Plugin id — must be unique within the composed plugin tree. */
export const name = 'dsh-file-upload'

/** Host services: fileUploads deps + connection for the upload Fetch route. */
export const inject = ['agents', 'attachments', 'commands', 'connection']

/** Exact route the browser client POSTs file bytes to. */
export const UPLOAD_PATH = '/api/dsh-file-upload'

/** Host apply: register the fileUploads service and the upload route. */
export function apply(ctx: Context): void {
  ctx.plugin(FileUploads)
  ctx.effect(() => ctx.connection.fetch.register({
    path: UPLOAD_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: handleUpload,
  }), 'dsh-file-upload: upload route')
}

/** Validate `?path=` + `?name=` and write the raw request body to <path>/<name>. */
async function handleUpload(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const path = params.get('path')
  const name = params.get('name')
  if (path === null || path.length === 0 || path.includes('\0') || !isAbsolute(path)) {
    return new Response('absolute path required', { status: 400 })
  }
  if (name === null || name.length === 0 || name === '.' || name === '..'
    || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    return new Response('invalid file name', { status: 400 })
  }
  // basename 防穿越：只接受单段文件名（上面已拒分隔符，这里双保险）。
  if (basename(name) !== name) return new Response('invalid file name', { status: 400 })
  try {
    const bytes = Buffer.from(await request.arrayBuffer())
    await writeFile(join(path, name), bytes)
    return new Response('ok', { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`write failed: ${message}`, { status: 500 })
  }
}
