// S11 手动验收使用的隔离 HTTP 响应；不转发请求到原后端。
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import process from 'node:process'
import console from 'node:console'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { portalFixtures } from '../apps/web/src/mocks/portal-fixtures.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.S11_PREVIEW_PORT ?? 4196)
const apiPort = Number(process.env.S11_PREVIEW_API_PORT ?? 4296)
const names = ['渗透测试', '防御验证', '基线检查', '漏洞扫描', '风险评估']
const tools = [
  { id: 'first', name: '本地测试工具 A', tags: ['隔离样例'] },
  { id: 'second', name: '本地测试工具 B', tags: ['镜像样例'] },
]
// 一个只含 README.txt 的有效 ZIP；用于检查下载链路，不代表真实检测产物。
const zip = Buffer.from(
  'UEsDBBQAAAAAAABgWF2IxwdoEgAAABIAAAAKAAAAUkVBRE1FLnR4dFMxMSBsb2NhbCBmaXh0dXJlClBLAQIUAxQAAAAAAABgWF2IxwdoEgAAABIAAAAKAAAAAAAAAAAAAACAAQAAAABSRUFETUUudHh0UEsFBgAAAAABAAEAOAAAADoAAAAAAA==',
  'base64',
)
const material = (id, name, options = {}) => ({
  id,
  name,
  path: `/${name}`,
  is_file: 1,
  attached: `/media/s11-preview/${name}`,
  size: 18,
  type: 'text/plain',
  isLink: false,
  create_time: '2026-10-24 12:00:00',
  altertime: '2026-10-24 12:00:00',
  ...options,
})
const api = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${apiPort}`)
  const json = (body, status = 200) => {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  }
  const path = url.pathname.replace(/^\/api/, '')
  if (path === '/front/user/info/')
    return json({
      id: 's11-preview',
      username: 'S11 本地测试学员',
      extend_info: { first_entry: true },
    })
  if (portalFixtures[path + url.search])
    return json(portalFixtures[path + url.search])
  if (portalFixtures[path]) return json(portalFixtures[path])
  if (path === '/admin/system/background/')
    return json({ front_background: '' })
  if (path === '/front/simulation/experiment/one/')
    return json({
      id: 'one',
      name: 'S11 本地测试实验（隔离数据）',
      desc: '仅用于本地验收，所有响应来自本地测试服务。',
      node_count: 0,
      user_name: '本地测试学员',
      tags: [],
      overview: '',
      release_type: 2,
      max_duration: 2,
      tags_category: null,
    })
  const base = '/front/wqzb/detection_front/tools/'
  if (path === base) {
    const label = names[Number(url.searchParams.get('tool_type')) - 1]
    return label
      ? json({ results: tools.map((tool) => ({ ...tool, tags: [label] })) })
      : json({ error: '未知测试分类' }, 400)
  }
  const match = path.match(
    /^\/front\/wqzb\/detection_front\/tools\/(first|second)\/(.*)$/,
  )
  if (match) {
    const [, id, action] = match
    if (!action)
      return json({
        ...tools.find((tool) => tool.id === id),
        description: '本地测试说明，用于核对分类与工具切换。',
        tool_carrier: id === 'first' ? 1 : 2,
        carrier_path: '/media/s11-preview/tool.zip',
        image_info: { name: '本地测试镜像' },
        account: 'demo / local-only（虚构测试数据）',
        user_manual:
          '<h2>本地测试手册</h2><p><strong>只读内容</strong>：切换工具和分类，再返回此页核对内容。</p>',
      })
    if (action === 'materials/') {
      const directory = url.searchParams.get('parent_path')
      return json({
        results:
          directory === '/samples'
            ? [
                material('nested', 'nested.txt', {
                  path: '/samples/nested.txt',
                }),
              ]
            : [
                material('folder', 'samples', {
                  is_file: 0,
                  attached: null,
                  size: 0,
                  path: '/samples',
                }),
                material('readme', 'README.txt'),
                material('office', 'manual.docx', {
                  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                }),
                material('video', 'sample.mp4', { type: 'video/mp4' }),
              ],
      })
    }
    if (action === 'materials/export_zip/' && request.method === 'POST') {
      let body = ''
      for await (const chunk of request) body += chunk
      const input = JSON.parse(body)
      if (!Array.isArray(input.material_ids) || !input.material_ids.length)
        return json({ error: '请选择有效的测试资料' }, 400)
      return json({ download_url: '/media/s11-preview/materials.zip' })
    }
  }
  if (url.pathname.startsWith('/media/s11-preview/')) {
    if (url.pathname.endsWith('.docx')) {
      response.writeHead(200, {
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': 'attachment; filename="manual.docx"',
      })
      return response.end(
        readFileSync(
          new URL('../tests/fixtures/s11-preview.docx', import.meta.url),
        ),
      )
    }
    if (url.pathname.endsWith('.mp4')) {
      response.writeHead(200, { 'content-type': 'video/mp4' })
      return response.end(
        readFileSync(
          new URL('../tests/fixtures/s11-preview.mp4', import.meta.url),
        ),
      )
    }
    const zipped = url.pathname.endsWith('.zip')
    response.writeHead(200, {
      'content-type': zipped ? 'application/zip' : 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${zipped ? 'materials.zip' : 'README.txt'}"`,
    })
    return response.end(zipped ? zip : 'S11 local fixture\n')
  }
  return json({ error: `本地测试未提供此接口：${path}` }, 404)
})
api.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
api.listen(apiPort, '127.0.0.1', () => {
  const vite = spawn(
    'pnpm',
    ['dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_ENABLE_MSW: 'false',
        VITE_API_BASE_URL: '/api',
        LOCAL_API_TARGET: `http://127.0.0.1:${apiPort}`,
        LOCAL_API_BASIC_AUTH: '',
        LOCAL_VITE_CACHE_DIR: 'node_modules/.vite-s11-preview',
      },
    },
  )
  const close = () => {
    vite.kill('SIGTERM')
    api.close()
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  vite.on('exit', (code) => {
    api.close()
    process.exitCode = code ?? 1
  })
  console.log(
    `S11 隔离测试页面：http://127.0.0.1:${port}/#/basic/user/bench/experiment/one/detection/penetration`,
  )
})
