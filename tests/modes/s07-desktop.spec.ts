import { expect, test, type WebSocketRoute } from '@playwright/test'
import { mount } from './s07-fixture'

function instruction(...values: Array<string | number>) {
  return (
    values.map((value) => `${String(value).length}.${value}`).join(',') + ';'
  )
}

test('图形VNC深链显示远端画面，键鼠/组合键与尺寸通过原Guacamole隧道发送', async ({
  page,
}, testInfo) => {
  const sent: string[] = []
  const sockets: WebSocketRoute[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.routeWebSocket('**/ws/kvmvnc/**', (socket) => {
    sockets.push(socket)
    socket.onMessage((data) => sent.push(String(data)))
    socket.send(
      instruction('size', 0, 320, 200) +
        instruction('rect', 0, 0, 0, 320, 200) +
        instruction('cfill', 12, 0, 35, 110, 200, 255) +
        instruction('sync', 1),
    )
  })
  await page.goto('/#/kvmvnc/vnc/run-a/设备a')
  await expect(page.getByRole('status')).toHaveText('已连接')
  expect(new URL(sockets.at(-1)!.url()).pathname).toBe('/ws/kvmvnc/run-a/')
  const canvas = page.locator('[aria-label="远程桌面"] canvas').first()
  await expect
    .poll(() =>
      canvas.evaluate((element: HTMLCanvasElement) =>
        Array.from(element.getContext('2d')!.getImageData(10, 10, 1, 1).data),
      ),
    )
    .toEqual([35, 110, 200, 255])
  await page
    .getByLabel('远程桌面', { exact: true })
    .click({ position: { x: 30, y: 40 } })
  await page.keyboard.press('a')
  await expect.poll(() => sent.join('')).toContain('3.key,2.97,1.1;')
  expect(
    sent
      .flatMap(decodeInstructions)
      .filter((item) => item[0] === 'key' && item[1] === '97'),
  ).toEqual([
    ['key', '97', '1'],
    ['key', '97', '0'],
  ])
  expect(sent.join('')).toContain('5.mouse,2.30,2.40,1.1;')
  await page.getByRole('button', { name: '组合键', exact: true }).click()
  await page
    .getByRole('button', { name: 'Ctrl+Alt+Delete', exact: true })
    .click()
  await expect.poll(() => sent.join('')).toContain('3.key,5.65535,1.1;')
  await page.setViewportSize({ width: 1000, height: 700 })
  await expect.poll(() => sent.join('')).toContain('4.size,4.1000,3.700;')
  await page.screenshot({ path: testInfo.outputPath('desktop.png') })
  expect(errors).toEqual([])
})

function decodeInstructions(message: string): string[][] {
  const instructions: string[][] = []
  let values: string[] = [],
    offset = 0
  while (offset < message.length) {
    const dot = message.indexOf('.', offset),
      length = Number(message.slice(offset, dot))
    const end = dot + 1 + length
    values.push(message.slice(dot + 1, end))
    if (message[end] === ';') {
      instructions.push(values)
      values = []
    }
    offset = end + 1
  }
  return instructions
}

test('RDP剪贴板及会话文件系统可读目录、下载与按ACK上传，权限拒绝仍可查看', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      },
    })
  })
  const requests: string[][] = [],
    uploads: Buffer[] = []
  let socket!: WebSocketRoute,
    uploaded = false
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.routeWebSocket('**/ws/kvmrdp/**', (route) => {
    socket = route
    route.onMessage((data) => {
      for (const values of decodeInstructions(String(data))) {
        requests.push(values)
        if (values[0] === 'get') {
          const path = values[2]!
          const directory = path === '/' || path === '/empty'
          const content = directory
            ? JSON.stringify(
                path === '/empty'
                  ? {}
                  : {
                      '/empty':
                        'application/vnd.glyptodon.guacamole.stream-index+json',
                      '/hello.txt': 'text/plain',
                      ...(uploaded
                        ? { '/upload.bin': 'application/octet-stream' }
                        : {}),
                    },
              )
            : '远端下载内容'
          route.send(
            instruction(
              'body',
              1,
              11,
              directory
                ? 'application/vnd.glyptodon.guacamole.stream-index+json'
                : 'text/plain',
              path,
            ) +
              instruction('blob', 11, Buffer.from(content).toString('base64')) +
              instruction('end', 11),
          )
        }
        if (values[0] === 'put')
          route.send(
            values[4] === '/denied.bin'
              ? instruction('ack', values[2]!, '拒绝上传', 513)
              : instruction('ack', values[2]!, 'OK', 0),
          )
        if (values[0] === 'blob') {
          uploads.push(Buffer.from(values[2]!, 'base64'))
          route.send(instruction('ack', values[1]!, 'OK', 0))
        }
        if (values[0] === 'end') uploaded = true
      }
    })
    route.send(
      instruction('size', 0, 320, 200) +
        instruction('sync', 1) +
        instruction('filesystem', 1, 'disk'),
    )
  })
  await page.goto('/#/kvmvnc/rdp/run-rdp/远程桌面')
  await expect(page.getByRole('status')).toHaveText('已连接')
  socket.send(
    instruction('clipboard', 9, 'text/plain') +
      instruction('blob', 9, Buffer.from('远端复制文本').toString('base64')) +
      instruction('end', 9),
  )
  await expect(
    page.getByText('浏览器拒绝写入剪贴板，可在剪贴板窗口查看。', {
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: '剪贴板', exact: true }).click()
  await expect(page.getByLabel('剪贴板内容', { exact: true })).toHaveValue(
    '远端复制文本',
  )
  await page.getByLabel('剪贴板内容', { exact: true }).fill('发往远端')
  await page.getByRole('button', { name: '发送到远端', exact: true }).click()
  await expect
    .poll(() =>
      requests.some(
        (item) =>
          item[0] === 'blob' &&
          Buffer.from(item[2]!, 'base64').toString() === '发往远端',
      ),
    )
    .toBe(true)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('b')
  await expect
    .poll(() =>
      requests.filter((item) => item[0] === 'key' && item[1] === '98'),
    )
    .toEqual([
      ['key', '98', '1'],
      ['key', '98', '0'],
    ])
  // 以下只检查文件上传流，排除刚才的剪贴板流。
  uploads.length = 0
  await page.getByRole('button', { name: '文件管理', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'hello.txt', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'empty', exact: true }).dblclick()
  await expect(page.getByText('此文件夹为空', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '返回上级', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'hello.txt', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('hello.txt')
  const stream = (await download.createReadStream())!
  const parts: Buffer[] = []
  for await (const part of stream) parts.push(Buffer.from(part))
  expect(Buffer.concat(parts).toString()).toBe('远端下载内容')
  const content = Buffer.alloc(4097, 65)
  await page.getByLabel('上传会话文件', { exact: true }).setInputFiles({
    name: 'upload.bin',
    mimeType: 'application/octet-stream',
    buffer: content,
  })
  await expect(page.getByText('上传成功！', { exact: true })).toBeVisible()
  expect(Buffer.concat(uploads)).toEqual(content)
  expect(requests.find((item) => item[0] === 'put')).toMatchObject({
    3: 'application/octet-stream',
    4: '/upload.bin',
  })
  uploads.length = 0
  await page.getByLabel('上传会话文件', { exact: true }).setInputFiles({
    name: 'denied.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('denied'),
  })
  await expect(page.getByText('拒绝上传', { exact: true })).toBeVisible()
  expect(uploads).toEqual([])
  await page.getByLabel('上传会话文件', { exact: true }).setInputFiles({
    name: 'empty.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(0),
  })
  await expect
    .poll(() => requests.filter((item) => item[0] === 'put').length)
    .toBe(3)
  await expect(page.getByLabel('上传会话文件', { exact: true })).toBeEnabled()
  expect(uploads).toEqual([])
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('c')
  await expect
    .poll(() =>
      requests.filter((item) => item[0] === 'key' && item[1] === '99'),
    )
    .toEqual([
      ['key', '99', '1'],
      ['key', '99', '0'],
    ])
  expect(errors).toEqual([])
})

test('节点图形VNC/RDP/noVNC按能力与准备请求开放，不混用画布ID', async ({
  page,
  context,
}) => {
  await context.routeWebSocket('**/ws/**', (socket) =>
    socket.send(instruction('size', 0, 320, 200) + instruction('sync', 1)),
  )
  const state = await mount(page, true)
  const info = state.stored.cells[0]!.data!.nodeInfo as {
    config_info: Record<string, unknown>
  }
  Object.assign(info.config_info, {
    type: 'libvirt',
    node_id: 'run-special',
    base_info: { console_type: 'vnc' },
  })
  let rdp = true,
    fail = true,
    noVncMissing = true
  const reads: string[] = []
  await page.route('**/api/front/topo/a/', (route) =>
    route.fulfill({ json: { status: 1, data: { is_rdp: rdp } } }),
  )
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  await page.route('**/api/front/topo/node_run/**', (route) => {
    const path = new URL(route.request().url()).pathname
    reads.push(path)
    if (path.endsWith('/rdp/') && fail) {
      fail = false
      return route.fulfill({ json: { status: 2, message: '远程桌面未准备好' } })
    }
    if (path.endsWith('/novnc/')) {
      const missing = noVncMissing
      noVncMissing = false
      return route.fulfill({
        json: {
          status: 1,
          data: missing
            ? {}
            : { novnc_url: 'http://127.0.0.1:4175/#/provided-novnc' },
        },
      })
    }
    return route.fulfill({ json: { status: 1 } })
  })
  await page.reload()
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  expect(reads).toEqual([])
  let popupPromise = context.waitForEvent('page')
  await page.getByRole('menuitem', { name: 'VNC', exact: true }).click()
  let popup = await popupPromise
  await expect(popup.getByRole('status')).toHaveText('已连接')
  expect(decodeURIComponent(popup.url())).toContain(
    '/#/kvmvnc/vnc/run-special/设备a',
  )
  await popup.close()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'RDP', exact: true }).click()
  await expect(
    page.getByText('远程桌面未准备好', { exact: true }),
  ).toBeVisible()
  await node.click({ button: 'right' })
  popupPromise = context.waitForEvent('page')
  await page.getByRole('menuitem', { name: 'RDP', exact: true }).click()
  popup = await popupPromise
  await expect(popup.getByRole('status')).toHaveText('已连接')
  expect(popup.url()).toContain('/#/kvmvnc/rdp/run-special/')
  await popup.close()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'noVNC', exact: true }).click()
  await expect(
    page.getByText('未返回noVNC地址！', { exact: true }),
  ).toBeVisible()
  await node.click({ button: 'right' })
  popupPromise = context.waitForEvent('page')
  await page.getByRole('menuitem', { name: 'noVNC', exact: true }).click()
  popup = await popupPromise
  await expect(popup).toHaveURL('http://127.0.0.1:4175/#/provided-novnc')
  await popup.close()
  expect(reads).toEqual([
    '/api/front/topo/node_run/run-special/rdp/',
    '/api/front/topo/node_run/run-special/rdp/',
    '/api/front/topo/node_run/run-special/novnc/',
    '/api/front/topo/node_run/run-special/novnc/',
  ])
  rdp = false
  await node.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: 'RDP', exact: true }),
  ).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('操作机分配、启动失败重试、选择切换、嵌入/全屏、释放与配置更新沿原调用链', async ({
  page,
  context,
}) => {
  const state = await mount(page)
  let machines: Array<Record<string, unknown>> = []
  let fail = true
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  const sessions: Array<{ socket: WebSocketRoute; closed: boolean }> = []
  await context.routeWebSocket('**/ws/**', (socket) => {
    const session = { socket, closed: false }
    sessions.push(session)
    socket.onClose(() => {
      session.closed = true
    })
    socket.send(instruction('size', 0, 320, 200) + instruction('sync', 1))
  })
  await page.route('**/api/front/default_operation_list/?*', (route) =>
    route.fulfill({ json: machines }),
  )
  await page.route('**/api/front/image/**', (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname
    calls.push({
      path,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    })
    if (path === '/api/front/image/operate/') {
      if (!machines.length)
        machines = [
          {
            id: 41,
            target_image: 77,
            name: '操作机甲',
            status: 0,
            is_distribute: true,
            img_type: 2,
            config: { cpu: 2, ram: 1024, disk: 10 },
            web_socker: { type: 'libvirt', uuid: 'machine-a' },
          },
          {
            id: 42,
            target_image: 78,
            name: '操作机乙',
            status: 2,
            is_distribute: true,
            img_type: 1,
            web_socker: { type: 'libvirt', uuid: 'machine-b' },
          },
        ]
    } else if (path === '/api/front/image/operate/77/') {
      if (req.method() === 'POST' && fail) {
        fail = false
        return route.fulfill({
          json: { status: 2, message: '操作机启动被拒绝' },
        })
      }
      machines[0]!.status = req.method() === 'POST' ? 2 : 0
    }
    return route.fulfill({ json: { status: 1 } })
  })
  await page.getByRole('button', { name: '我的操作机', exact: true }).click()
  await expect(page.getByText('暂未分配操作机', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '分配操作机', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: '操作机甲' })
  await row.getByRole('button', { name: '启动', exact: true }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(
    page.getByText('操作机启动被拒绝', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(row).toContainText('启动成功')
  await row.getByRole('button', { name: '控制台', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('已连接')
  const old = sessions.at(-1)!
  await page
    .getByRole('row')
    .filter({ hasText: '操作机乙' })
    .getByRole('button', { name: '控制台', exact: true })
    .click()
  await expect.poll(() => old.closed).toBe(true)
  expect(new URL(sessions.at(-1)!.socket.url()).pathname).toBe(
    '/ws/kvmvnc/machine-b/',
  )
  const popupPromise = context.waitForEvent('page')
  await page.getByRole('button', { name: '全屏', exact: true }).click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(/#\/mpst\/fullscreen\/vnc\/machine-b$/)
  await expect(popup.getByRole('status')).toHaveText('已连接')
  await popup.close()
  await row.getByRole('button', { name: '释放', exact: true }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(row).toContainText('未启动')
  await page.getByRole('button', { name: '更新操作机', exact: true }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  expect(calls.filter((item) => item.path.endsWith('/operate/77/'))).toEqual([
    {
      path: '/api/front/image/operate/77/',
      method: 'POST',
      body: { ids: null, resource_type: 1, resource_id: 41 },
    },
    {
      path: '/api/front/image/operate/77/',
      method: 'POST',
      body: { ids: null, resource_type: 1, resource_id: 41 },
    },
    {
      path: '/api/front/image/operate/77/',
      method: 'DELETE',
      body: { resource_type: 1, resource_id: 41 },
    },
  ])
  await expect
    .poll(() => calls.slice(-2).map((item) => item.path))
    .toEqual([
      '/api/front/image/default/operation/topo/',
      '/api/front/image/operate/',
    ])
  const current = sessions.findLast((item) => !item.closed)!
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect.poll(() => current.closed).toBe(true)
  await page.route(
    '**/api/front/exam/ability_appraisa/study_situation/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: {
            login_day: 0,
            study_length: 0,
            finished_course: 0,
            finished_subject_scene: 0,
            finished_assessment: 0,
          },
        },
      }),
  )
  await page.goto('/#/basic/personal/resource')
  const personalPopup = context.waitForEvent('page')
  await page
    .getByRole('row')
    .filter({ hasText: '操作机乙' })
    .getByRole('button', { name: 'RDP访问', exact: true })
    .click()
  const desktop = await personalPopup
  await expect(desktop.getByRole('status')).toHaveText('已连接')
  expect(desktop.url()).toContain('/#/kvmvnc/rdp/machine-b/')
  await desktop.close()
  await page.goto('/#/controlpanel/learn/41')
  await expect(page.getByRole('alert')).toContainText(
    '缺少任务、资源及操作详情上下文',
  )
  expect(state.errors).toEqual([])
})

test('分类错误手动重连/关闭释放会话与监听，SPA切换不保留旧流和延迟任务', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>()
    const add = window.addEventListener.bind(window),
      remove = window.removeEventListener.bind(window)
    window.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === 'blur') listeners.add(listener)
      add(type, listener, options)
    }) as typeof window.addEventListener
    window.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === 'blur') listeners.delete(listener)
      remove(type, listener, options)
    }) as typeof window.removeEventListener
    Object.assign(window, { desktopBlurListeners: () => listeners.size })
  })
  const errors: string[] = [],
    sessions: Array<{
      socket: WebSocketRoute
      sent: string[]
      closed: boolean
    }> = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    const session = { socket, sent: [] as string[], closed: false }
    sessions.push(session)
    socket.onMessage((data) => session.sent.push(String(data)))
    socket.onClose(() => {
      session.closed = true
    })
    socket.send(
      instruction('size', 0, 320, 200) +
        instruction('sync', 1) +
        instruction('filesystem', 1, 'disk'),
    )
  })
  await page.goto('/#/controlpanel/learn/7')
  await expect(page.getByRole('alert')).toBeVisible()
  const listenerCount = () =>
    page.evaluate(() =>
      (
        window as unknown as { desktopBlurListeners: () => number }
      ).desktopBlurListeners(),
    )
  const baseline = await listenerCount()
  await page.evaluate(() => {
    window.location.hash = '/kvmvnc/rdp/a/old'
  })
  await expect(page.getByRole('status')).toHaveText('已连接')
  const activeCount = await listenerCount(),
    old = sessions.at(-1)!
  old.socket.send(instruction('error', 'isolated-error', 769))
  await expect(page.getByRole('alertdialog')).toContainText(
    '服务器密码验证失败',
  )
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('已连接')
  await expect.poll(() => old.closed).toBe(true)
  expect(await listenerCount()).toBe(activeCount)
  const next = sessions.at(-1)!
  next.socket.send(instruction('error', 'isolated-error', 522))
  await expect(page.getByRole('alertdialog')).toContainText('会话连接超时')
  await page.getByRole('button', { name: '关闭连接', exact: true }).click()
  await expect(page.locator('[aria-label="远程桌面"] canvas')).toHaveCount(0)
  await expect(page.getByLabel('远程键盘输入', { exact: true })).toHaveCount(0)
  expect(await listenerCount()).toBe(baseline)
  const count = sessions.length
  await page.clock.install()
  await page.clock.fastForward(6000)
  expect(sessions).toHaveLength(count)
  expect(next.sent.join('')).not.toContain('3.get')
  await page.evaluate(() => {
    window.location.hash = '/mpst/fullscreen/vnc/new'
  })
  await expect(page.getByRole('status')).toHaveText('已连接')
  const last = sessions.at(-1)!
  await page.evaluate(() => {
    window.location.hash = '/kvmvnc/invalid/missing/name'
  })
  await expect(page.getByRole('alert')).toHaveText('不支持的图形控制台类型')
  await expect.poll(() => last.closed).toBe(true)
  expect(await listenerCount()).toBe(baseline)
  expect(errors).toEqual([])
})
