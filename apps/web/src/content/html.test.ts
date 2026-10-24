// @vitest-environment jsdom

import { expect, it } from 'vitest'
import { sanitizeContent, validateImageSources } from './html'
it('历史格式与图片尺寸保留，脚本、事件和危险样式被净化，正文 host 不绕过图片来源检查', () => {
  const html =
    '<h2>标题</h2><p class="ql-align-right ql-direction-rtl ql-indent-2"><strong>粗体</strong><sub>下标</sub><span style="color: rgb(255, 0, 0); background-color: yellow">色彩</span><img src="/uploads/a.png" width="240" height="120" onerror="alert(1)"></p><script>alert(1)</script>'
  const safe = sanitizeContent(html)
  expect(safe).toContain('<h2>标题</h2>')
  expect(safe).toContain('ql-align-right ql-direction-rtl ql-indent-2')
  expect(safe).toContain('width="240" height="120"')
  expect(safe).toContain('background-color: yellow')
  expect(safe).not.toContain('onerror')
  expect(safe).not.toContain('<script>')
  expect(() =>
    validateImageSources(
      `<p>${location.host}</p><img src="https://evil.example/a.png">`,
    ),
  ).toThrow('外部图片')
  expect(() => validateImageSources('<img src="/uploads/a.png">')).not.toThrow()
})
