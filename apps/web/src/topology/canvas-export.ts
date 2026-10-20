/** 只向用户暴露失败阶段，不透传可能包含签名URL的底层异常。 */
export class CanvasExportError extends Error {}

/** 导出实际画布 DOM；视觉产物不承载可恢复的拓扑配置。 */
export async function exportCanvas(
  element: HTMLElement,
  format: 'png' | 'svg',
  signal: AbortSignal,
) {
  if (element.clientWidth <= 0 || element.clientHeight <= 0)
    throw new CanvasExportError(
      '画布导出失败：画布当前不可见，请展开画布后重试。',
    )
  const exportSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)])
  let stage = '字体加载'
  try {
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
    stage = '图标读取或解码'
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
    stage = '导出模块加载'
    const { toSvg } = await import('html-to-image')
    stage = 'SVG生成或资源嵌入'
    // html-to-image 深拷贝内嵌 SVG，却不复制其后代的计算样式。
    // 脱离页面样式表后，标签背景等图元会回退为 SVG 默认黑色。
    const svgChildren = (root: Element) =>
      Array.from(root.querySelectorAll('svg')).flatMap((svg) =>
        Array.from(svg.querySelectorAll<SVGElement>('*')),
      )
    const svgStyles = svgChildren(element).map((node) => {
      const style = getComputedStyle(node)
      return Array.from(
        style,
        (name) => [name, style.getPropertyValue(name)] as const,
      )
    })
    const svg = await toSvg(element, {
      cacheBust: true,
      includeQueryParams: true,
      fetchRequestInit: { signal: exportSignal },
    })
    const documentSvg = new DOMParser().parseFromString(
      decodeURIComponent(svg.slice(svg.indexOf(',') + 1)),
      'image/svg+xml',
    )
    const svgDescendants = svgChildren(
      documentSvg.querySelector('foreignObject')!,
    )
    if (svgDescendants.length !== svgStyles.length)
      throw new Error('画布在导出期间发生变化')
    svgDescendants.forEach((node, index) => {
      for (const [name, value] of svgStyles[index]!)
        node.style.setProperty(name, value)
    })
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
    if (format === 'png') {
      stage = 'PNG编码'
      // 保持原 viewBox 与布局，直接以 3 倍尺寸栅格化矢量内容，
      // 避免先生成 1 倍位图再放大造成文字和连线模糊。
      const root = documentSvg.documentElement
      for (const dimension of ['width', 'height'])
        root.setAttribute(
          dimension,
          String(Number(root.getAttribute(dimension)) * 3),
        )
    }
    let url =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(new XMLSerializer().serializeToString(documentSvg))
    if (format === 'png') {
      stage = 'PNG编码'
      const image = new Image()
      image.src = url
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
  } catch {
    throw new CanvasExportError(
      exportSignal.aborted
        ? '画布导出失败：操作超时或已取消，请重试。'
        : `画布导出失败：${stage}失败。`,
    )
  }
}
