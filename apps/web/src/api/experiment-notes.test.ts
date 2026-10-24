import { afterEach, expect, it, vi } from 'vitest'
import {
  getExperimentNote,
  saveExperimentNote,
  exportExperimentNote,
} from './experiment-notes'
afterEach(() => vi.unstubAllGlobals())
it('场景笔记保存后重读持久化正文；未确认的正文不能冒充保存成功', async () => {
  vi.stubGlobal('fetch', async (_url: URL, options: RequestInit) =>
    Response.json(
      options.method === 'POST'
        ? { status: 1 }
        : { id: 8, content: '<p>旧正文</p>' },
    ),
  )
  await expect(
    saveExperimentNote('a/b', '<p>新正文</p>'),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
})
it.each([
  {},
  null,
  { id: null, content: '' },
  { id: 1 },
  { id: 1, content: null },
])('未知空笔记或坏响应%j明确阻塞，不伪造空正文', async (value) => {
  vi.stubGlobal('fetch', async () => Response.json(value))
  await expect(getExperimentNote('one')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('空字符串正文属于已确认id/content形状，读取取消与导出缺地址分别报告', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ id: 2, content: '' }))
  await expect(getExperimentNote('one')).resolves.toEqual({
    id: 2,
    content: '',
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: { url: '/wrong.docx' } }),
  )
  await expect(exportExperimentNote('one', 2)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  const abort = new AbortController()
  abort.abort()
  vi.stubGlobal('fetch', async () => {
    throw new DOMException('Aborted', 'AbortError')
  })
  await expect(getExperimentNote('one', abort.signal)).rejects.toMatchObject({
    kind: 'cancelled',
  })
})
