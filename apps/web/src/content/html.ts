import DOMPurify from 'dompurify'

// 保留 Quill 历史 HTML 的格式；仅允许内容样式，禁止 CSS 请求及定位覆盖。
export function sanitizeContent(html: string) {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['data-list', 'data-checked', 'data-blot-align'],
    FORBID_TAGS: ['iframe', 'form', 'input', 'button', 'video', 'audio'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  for (const element of doc.body.querySelectorAll<HTMLElement>('[style]')) {
    const allowed = [
      'color',
      'background-color',
      'text-align',
      'direction',
      'font-size',
      'font-family',
      'width',
      'height',
    ]
    const style = element.style
    for (const name of Array.from(style)) {
      if (
        !allowed.includes(name) ||
        /url\s*\(|expression|var\(/i.test(style.getPropertyValue(name))
      )
        style.removeProperty(name)
    }
  }
  return doc.body.innerHTML
}

export function validateImageSources(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const image of doc.images) {
    const source = image.getAttribute('src') ?? ''
    const address = new URL(source, location.href)
    if (
      !source ||
      !['http:', 'https:'].includes(address.protocol) ||
      address.origin !== location.origin
    )
      throw new Error('含有外部图片，请先上传图片后再保存')
  }
}
