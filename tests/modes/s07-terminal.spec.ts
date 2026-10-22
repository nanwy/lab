import { createServer } from 'node:http'
import { expect, test, type WebSocketRoute } from '@playwright/test'
import { mount } from './s07-fixture'

test('文本终端深链连接原WS路径，渲染远端ANSI并双向发送且刷新重新连接', async ({
  page,
}, testInfo) => {
  const connections: WebSocketRoute[] = []
  const sent: Array<string | Buffer> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    connections.push(socket)
    socket.onMessage((data) => {
      sent.push(data)
      if (data === '\r') socket.send('\r\n远端执行完成\r\n')
    })
    socket.send('\x1b[31m远端终端已就绪\x1b[0m\r\n$ ')
  })
  await page.goto('/#/vnccontrol/docker/run-one')
  const terminal = page.locator('.xterm-rows')
  await expect(terminal).toContainText('远端终端已就绪')
  expect(connections[0]!.url()).toBe(
    'ws://127.0.0.1:4175/ws/dockerssh/run-one/',
  )
  await page.locator('.xterm-helper-textarea').pressSequentially('pwd')
  await page.locator('.xterm-helper-textarea').press('Enter')
  await expect.poll(() => sent.join('')).toBe('pwd\r')
  await expect(terminal).toContainText('远端执行完成')
  await page.screenshot({ path: testInfo.outputPath('terminal.png') })
  const beforeReload = connections.length
  await page.reload()
  await expect(terminal).toContainText('远端终端已就绪')
  await expect.poll(() => connections.length).toBeGreaterThan(beforeReload)
  expect(errors).toEqual([])
})

test('vpcs心跳、闲置提示与手动重连；断开和离页后停止输入及心跳', async ({
  page,
}) => {
  await page.clock.install()
  const sessions: Array<{
    socket: WebSocketRoute
    sent: Array<string | Buffer>
    closed: boolean
  }> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    const session = {
      socket,
      sent: [] as Array<string | Buffer>,
      closed: false,
    }
    sessions.push(session)
    socket.onMessage((data) => session.sent.push(data))
    socket.onClose(() => {
      session.closed = true
    })
    socket.send(`会话${sessions.length}\r\n$ `)
  })
  await page.goto('/#/vnccontrol/vpcs/node%20two')
  const terminal = page.locator('.xterm-rows')
  await expect(terminal).toContainText('会话')
  const current = sessions.at(-1)!
  expect(current.socket.url()).toBe('ws://127.0.0.1:4175/ws/vpcssh/node%20two/')
  await page.clock.fastForward(60_000)
  await expect.poll(() => current.sent).toEqual(['{"heart":"HeartBeat"}'])
  current.socket.send('由于长时间没有操作，连接已断开!')
  await expect(page.getByRole('alertdialog')).toContainText(
    '由于长时间没有操作，连接已断开!',
  )
  await expect.poll(() => current.closed).toBe(true)
  const count = sessions.length
  await page.clock.fastForward(180_000)
  expect(current.sent).toHaveLength(1)
  expect(sessions).toHaveLength(count)
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await expect.poll(() => sessions.length).toBeGreaterThan(count)
  const next = sessions.at(-1)!
  next.socket.send(Buffer.from('新会话字节输出\r\n', 'utf8'))
  await expect(terminal).toContainText('新会话字节输出')
  await expect(terminal).not.toContainText('由于长时间')
  next.socket.close({ code: 1008, reason: '拒绝过期会话' })
  await expect(page.getByRole('alertdialog')).toContainText('连接已关闭')
  await page.getByRole('button', { name: '关闭连接', exact: true }).click()
  await expect(page.locator('.xterm')).toHaveCount(0)
  await page.keyboard.type('local-only')
  expect(next.sent).toEqual([])
  await page.clock.fastForward(60_000)
  expect(next.sent).toEqual([])
  const beforeSwitch = sessions.length
  await page.evaluate(() => {
    window.location.hash = '/vnccontrol/docker/other-node'
  })
  await expect.poll(() => sessions.length).toBeGreaterThan(beforeSwitch)
  const last = sessions.at(-1)!
  await expect(terminal).toContainText(`会话${sessions.length}`)
  await expect(terminal).not.toContainText('新会话字节输出')
  await page.evaluate(() => {
    window.location.hash = '/vnccontrol/invalid/bad'
  })
  await expect(page.getByRole('alert')).toHaveText('不支持的文本终端类型')
  await expect.poll(() => last.closed).toBe(true)
  await page.clock.fastForward(120_000)
  expect(last.sent).toEqual([])
  expect(errors).toEqual([])
})

test('非法类型与缺失上下文不会创建WS，网络失败不能显示本地回显', async ({
  page,
}) => {
  let count = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.routeWebSocket('**/ws/**', (socket) => {
    count++
    socket.close({ code: 1006 })
  })
  for (const path of [
    'qemu/id',
    'docker/undefined',
    'vpcs/null',
    'docker/%20',
  ]) {
    await page.goto(`/#/vnccontrol/${path}`)
    await expect(page.getByRole('alert')).toBeVisible()
  }
  expect(count).toBe(0)
  await page.goto('/#/vnccontrol/docker/denied')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.locator('.xterm-rows')).not.toContainText('$ ')
  expect(errors).toEqual([])
})

test('运行节点文本入口按原类型映射，使用config连接标识且锁图仍可连接', async ({
  page,
  context,
}) => {
  await context.routeWebSocket('**/ws/**', (socket) =>
    socket.send('隔离操作机终端\r\n'),
  )
  const state = await mount(page, true)
  const config = state.stored.cells[0]!.data!.nodeInfo!.config_info as Record<
    string,
    unknown
  >
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  const node = page.locator('.react-flow__node[data-id="a"]')
  for (const [type, consoleType, target] of [
    ['docker', '', 'docker'],
    ['docker_webide', '', 'docker'],
    ['vpcs', '', 'vpcs'],
    ['dynamips', '', 'vpcs'],
    ['qemu', '', 'vpcs'],
    ['libvirt', 'telnet', 'vpcs'],
    ['libvirt_middle_intercept', 'telnet', 'vpcs'],
  ]) {
    Object.assign(config, {
      type,
      node_id: 'run-connection',
      base_info: { console_type: consoleType },
    })
    await page.reload()
    await node.click({ button: 'right' })
    const popupPromise = context.waitForEvent('page')
    await page.getByRole('menuitem', { name: 'VNC', exact: true }).click()
    const popup = await popupPromise
    await expect(popup).toHaveURL(
      new RegExp(`/#/vnccontrol/${target}/run-connection$`),
    )
    await expect(popup.locator('.xterm-rows')).toContainText('隔离操作机终端')
    await popup.close()
  }
  Object.assign(config, { type: 'docker', node_id: undefined })
  await page.reload()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'VNC', exact: true }).click()
  await expect(
    page.getByText('缺少有效的节点连接标识', { exact: true }),
  ).toBeVisible()
  Object.assign(config, {
    type: 'libvirt',
    node_id: 'a',
    base_info: { console_type: 'vnc' },
  })
  await page.reload()
  await node.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: 'VNC', exact: true }),
  ).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('原生WS握手拒绝与上游超时显示失败，关闭后无本地回显或自动重连', async ({
  page,
}) => {
  const upstream = createServer()
  let requests = 0
  upstream.on('upgrade', (req, socket) => {
    requests++
    const status = req.url?.includes('timeout')
      ? '408 Request Timeout'
      : '403 Forbidden'
    socket.end(
      `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
    )
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('测试端口未分配')
  // 只替换网络系统边界的目标端口，保留浏览器原生WS握手/错误事件。
  await page.addInitScript((port) => {
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        const target = new URL(url)
        if (target.pathname.startsWith('/ws/')) target.port = String(port)
        super(target.href, protocols)
      }
    }
  }, address.port)
  const errors: string[] = []
  const networkErrors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') networkErrors.push(message.text())
  })
  try {
    for (const id of ['denied', 'timeout']) {
      await page.goto(`/#/vnccontrol/docker/${id}`)
      await expect(page.getByRole('alertdialog')).toContainText(
        '连接失败，请确认节点运行状态及会话权限。',
      )
      await page.getByRole('button', { name: '关闭连接', exact: true }).click()
      await expect(page.locator('.xterm')).toHaveCount(0)
      await page.keyboard.type('no-local-echo')
    }
    expect(networkErrors.length).toBeGreaterThan(0)
    for (const error of networkErrors) {
      expect(error).toContain(
        `WebSocket connection to 'ws://127.0.0.1:${address.port}/ws/dockerssh/`,
      )
      expect(error).toContain('failed:')
    }
    const before = requests
    await page.clock.install()
    await page.clock.fastForward(180_000)
    expect(requests).toBe(before)
    expect(errors).toEqual([])
  } finally {
    await page.goto('/#/vnccontrol/invalid/closed')
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
