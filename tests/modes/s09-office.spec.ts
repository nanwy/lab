import { expect, test } from '@playwright/test'

const filePath =
  'https://files.example.test/资料.docx?token=a%2Fb&part=2#page=4'
function entry(file = filePath, mode = 'view') {
  return `/#/office/viewer?${new URLSearchParams({ filePath: file, mode })}`
}

test('Office 等待配置，完整传递文件与模式，拦截后可手动打开', async ({
  page,
}, testInfo) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/**', async (route) => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/'))
      return route.fallback()
    if (route.request().url().endsWith('/admin/system/logo/default/')) {
      await held
      return route.fulfill({
        json: { onlyoffice_url: 'https://office.example.test/' },
      })
    }
    return route.fulfill({ status: 404, json: {} })
  })
  await page.addInitScript(() => {
    window.open = (url) => {
      document.body.dataset.openedUrl = String(url)
      document.body.dataset.openCount = String(
        Number(document.body.dataset.openCount ?? '0') + 1,
      )
      return null
    }
  })
  await page.goto(entry())
  await expect(page.getByRole('heading', { name: '文档预览' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('正在读取预览服务配置…')
  expect(await page.locator('body').getAttribute('data-open-count')).toBeNull()
  release()
  await expect(page.getByText('浏览器未能打开预览窗口')).toBeVisible()
  const link = page.getByRole('link', { name: '打开文档' })
  await expect(link).toHaveAttribute('target', '_blank')
  const url = new URL((await link.getAttribute('href'))!)
  expect(url.origin).toBe('https://office.example.test')
  expect(url.pathname).toBe('/web-apps/')
  expect(url.searchParams.get('filePath')).toBe(filePath)
  expect(url.searchParams.get('mode')).toBe('view')
  expect(await page.locator('body').getAttribute('data-open-count')).toBe('1')
  await page.screenshot({
    path: testInfo.outputPath('office-desktop.png'),
    fullPage: true,
  })
})

test('缺少参数与无效协议不会打开，根相对文件地址和明确模式可用', async ({
  page,
}, testInfo) => {
  let reads = 0
  await page.route('**/api/admin/system/logo/default/', (route) => {
    reads++
    return route.fulfill({
      json: { onlyoffice_url: 'https://office.example.test' },
    })
  })
  await page.addInitScript(() => {
    window.open = (url) => {
      document.body.dataset.openedUrl = String(url)
      return null
    }
  })
  await page.goto('/#/office/viewer?filePath=%2Fmedia%2Fbook.docx')
  await expect(page.getByRole('alert')).toContainText(
    '链接缺少 filePath 或 mode 参数',
  )
  expect(reads).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('office-missing.png'),
    fullPage: true,
  })
  await page.goto(entry('javascript:alert(1)'))
  await expect(page.getByRole('alert')).toHaveText('文档地址或预览服务地址无效')
  expect(await page.locator('body').getAttribute('data-opened-url')).toBeNull()
  await page.goto(entry('/media/handbook.docx?token=a&part=2', 'edit'))
  await expect(page.getByRole('link', { name: '打开文档' })).toBeVisible()
  const url = new URL(
    (await page.getByRole('link', { name: '打开文档' }).getAttribute('href'))!,
  )
  expect(url.searchParams.get('filePath')).toBe(
    '/media/handbook.docx?token=a&part=2',
  )
  expect(url.searchParams.get('mode')).toBe('edit')
})

test('空配置与配置请求失败均可恢复，未成功打开不会称为已联通', async ({
  page,
}, testInfo) => {
  let config: 'empty' | 'failed' | 'valid' = 'empty'
  await page.route('**/api/admin/system/logo/default/', (route) =>
    config === 'failed'
      ? route.fulfill({ status: 500, json: { message: '配置查询失败' } })
      : route.fulfill({
          json: {
            onlyoffice_url:
              config === 'valid' ? 'https://office.example.test' : '',
          },
        }),
  )
  await page.addInitScript(() => {
    window.open = () => {
      throw new Error('blocked')
    }
  })
  await page.goto(entry())
  await expect(page.getByRole('alert')).toHaveText('未配置文档预览服务')
  await expect(page.getByRole('link', { name: '打开文档' })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('office-empty.png'),
    fullPage: true,
  })
  config = 'failed'
  await page.getByRole('button', { name: '重新读取配置' }).click()
  await expect(page.getByRole('alert')).toContainText('配置暂时不可用')
  await page.screenshot({
    path: testInfo.outputPath('office-config-error.png'),
    fullPage: true,
  })
  config = 'valid'
  await page.getByRole('button', { name: '重新读取配置' }).click()
  await expect(page.getByRole('alert')).toHaveText('浏览器未能打开预览窗口')
  await expect(page.getByRole('link', { name: '打开文档' })).toBeVisible()
  await expect(page.getByText('预览窗口已打开', { exact: true })).toHaveCount(0)
})

test('参数切换取消旧动作且新窗口只打开一次，卸载后没有旧动作', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/admin/system/logo/default/', (route) =>
    route.fulfill({ json: { onlyoffice_url: 'https://office.example.test' } }),
  )
  await page.addInitScript(() => {
    window.open = (url) => {
      document.body.dataset.openedUrl = String(url)
      document.body.dataset.openCount = String(
        Number(document.body.dataset.openCount ?? '0') + 1,
      )
      return {} as Window
    }
  })
  await page.goto(entry('/media/old.docx'))
  await expect(page.getByRole('link', { name: '打开文档' })).toBeVisible()
  await page.evaluate(() => {
    window.location.hash =
      '/office/viewer?filePath=%2Fmedia%2Fnew.docx&mode=view'
  })
  await expect(page.getByRole('heading', { name: 'new.docx' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('预览窗口已打开')
  expect(
    new URL(
      (await page.locator('body').getAttribute('data-opened-url'))!,
    ).searchParams.get('filePath'),
  ).toBe('/media/new.docx')
  expect(await page.locator('body').getAttribute('data-open-count')).toBe('1')
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.screenshot({
    path: testInfo.outputPath('office-tablet-opened.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.screenshot({
    path: testInfo.outputPath('office-mobile-opened.png'),
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => {
    window.location.hash =
      '/office/viewer?filePath=%2Fmedia%2Funmounted.docx&mode=view'
  })
  await expect(
    page.getByRole('heading', { name: 'unmounted.docx' }),
  ).toBeVisible()
  await page.evaluate(() => {
    window.location.hash = '/resources'
  })
  await expect(page.getByRole('heading', { name: '资源样例' })).toBeVisible()
  // 只为验证原500ms延时动作确已取消。
  await page.waitForTimeout(650)
  expect(await page.locator('body').getAttribute('data-open-count')).toBe('1')
  expect(errors).toEqual([])
})
