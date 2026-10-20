/** 导出实际画布 DOM；视觉产物不承载可恢复的拓扑配置。 */
export async function exportCanvas(
  element: HTMLElement,
  format: 'png' | 'svg',
  signal: AbortSignal,
) {
  const exportSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  await document.fonts.ready
  const families = new Set(
    [element, ...element.querySelectorAll('*')].flatMap((node) =>
      getComputedStyle(node)
        .fontFamily.split(',')
        .map((name) => name.trim().replace(/['"]/g, '')),
    ),
  )
  for (const font of document.fonts)
    if (
      families.has(font.family.replace(/['"]/g, '')) &&
      font.status === 'error'
    )
      throw new Error('画布字体未能加载')
  // 先检查资源可读取性，避免转换库将读取失败缓存为空图片后无法重试。
  await Promise.all(
    Array.from(element.querySelectorAll('img')).map(async (image) => {
      await image.decode()
      if (image.currentSrc.startsWith('data:')) return
      const response = await fetch(image.currentSrc, {
        cache: 'no-store',
        signal: exportSignal,
      })
      if (!response.ok) throw new Error('画布图标无法读取')
      await response.blob()
    }),
  )
  const { toSvg } = await import('html-to-image')
  const svg = await toSvg(element, {
    cacheBust: true,
    includeQueryParams: true,
    fetchRequestInit: { signal: exportSignal },
  })
  const documentSvg = new DOMParser().parseFromString(
    decodeURIComponent(svg.slice(svg.indexOf(',') + 1)),
    'image/svg+xml',
  )
  for (const image of documentSvg.querySelectorAll('img'))
    if (!image.getAttribute('src')?.startsWith('data:'))
      throw new Error('画布导出包含未能嵌入的图标')
  for (const node of documentSvg.querySelectorAll('[style],style')) {
    const css =
      node.localName === 'style'
        ? (node.textContent ?? '')
        : (node.getAttribute('style') ?? '')
    for (const match of css.matchAll(/url\((.*?)\)/g)) {
      const url = match[1]!.trim().replace(/^['"]|['"]$/g, '')
      if (!url.startsWith('data:') && !url.startsWith('#'))
        throw new Error('画布导出包含未能嵌入的字体或图片')
    }
  }
  let url = svg
  if (format === 'png') {
    const image = new Image()
    image.src = svg
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法生成画布图片')
    context.drawImage(image, 0, 0)
    url = canvas.toDataURL('image/png')
  }
  const link = document.createElement('a')
  exportSignal.throwIfAborted()
  link.href = url
  link.download = `拓扑.${format}`
  link.click()
}
