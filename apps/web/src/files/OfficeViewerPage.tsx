import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { ApiError } from '../api'
import { platformLogoOptions } from '../portal/PlatformBranding'
import './office-viewer.css'

type OfficeSearch = { filePath?: string; mode?: string }

export function parseOfficeSearch(
  search: Record<string, unknown>,
): OfficeSearch {
  return {
    filePath: typeof search.filePath === 'string' ? search.filePath : undefined,
    mode: typeof search.mode === 'string' ? search.mode : undefined,
  }
}

function previewUrl(service: string, filePath: string, mode: string) {
  const file = new URL(filePath, window.location.origin)
  const host = new URL(service, window.location.origin)
  if (![file, host].every((url) => ['http:', 'https:'].includes(url.protocol)))
    throw new Error('文档地址或预览服务地址无效')
  host.pathname = `${host.pathname.replace(/\/$/, '')}/web-apps/`
  host.search = ''
  host.hash = ''
  host.searchParams.set('filePath', filePath)
  host.searchParams.set('mode', mode)
  return host.href
}

export function OfficeViewerPage({ filePath, mode }: OfficeSearch) {
  const valid = Boolean(filePath?.trim() && mode?.trim())
  const config = useQuery({ ...platformLogoOptions, enabled: valid })
  const [opened, setOpened] = useState<'pending' | 'opened' | 'blocked'>(
    'pending',
  )
  const attempted = useRef<string | null>(null)
  let url: string | undefined
  let problem: string | undefined
  if (!valid)
    problem = '链接缺少 filePath 或 mode 参数，请从原文档入口重新打开。'
  else if (config.isSuccess) {
    if (!config.data.onlyoffice_url?.trim()) problem = '未配置文档预览服务'
    else {
      try {
        url = previewUrl(config.data.onlyoffice_url, filePath!, mode!)
      } catch {
        problem = '文档地址或预览服务地址无效'
      }
    }
  }
  useEffect(() => {
    if (!url || attempted.current === url) return
    const target = url
    const timer = window.setTimeout(() => {
      attempted.current = target
      try {
        const preview = window.open(target, '_blank')
        if (preview) {
          preview.opener = null
          setOpened('opened')
        } else setOpened('blocked')
      } catch {
        setOpened('blocked')
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [url])

  const fileName = (() => {
    if (!filePath) return '等待文档链接'
    try {
      const path = new URL(filePath, window.location.origin).pathname
      return decodeURIComponent(path.split('/').pop() || '文档')
    } catch {
      return '文档'
    }
  })()
  const error = config.error
  const detail =
    problem ??
    (config.isError
      ? error instanceof ApiError && error.handled
        ? '预览服务配置暂时不可用，请重试。'
        : (error?.message ?? '预览服务配置暂时不可用，请重试。')
      : opened === 'blocked'
        ? '浏览器未能打开预览窗口'
        : opened === 'opened'
          ? '预览窗口已打开'
          : config.isPending
            ? '正在读取预览服务配置…'
            : '正在打开文档…')
  return (
    <main className="office-viewer">
      <header className="office-viewer-header">
        <Link to="/basic/home" className="office-viewer-brand">
          学员资料档案室
        </Link>
        <span>DOCUMENT ACCESS</span>
      </header>
      <section className="office-viewer-content" aria-labelledby="office-title">
        <div className="office-viewer-heading">
          <p className="office-viewer-kicker">资料 / 文档预览</p>
          <h1 id="office-title">
            文档预览<span aria-hidden="true">↗</span>
          </h1>
          <p className="office-viewer-intro">从资料到阅读，只隔一个窗口。</p>
        </div>
        <div className="office-viewer-document">
          <div className="office-viewer-sheet" aria-hidden="true">
            <span>DOC</span>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="office-viewer-file">
            <span className="office-viewer-label">当前文档</span>
            <h2>{fileName}</h2>
            <p>由平台配置的 Office 服务打开</p>
          </div>
        </div>
        <div className="office-viewer-feedback">
          <p
            role={
              problem || config.isError || opened === 'blocked'
                ? 'alert'
                : 'status'
            }
          >
            <span
              className={
                url && opened === 'pending' ? 'office-viewer-pulse' : ''
              }
              aria-hidden="true"
            />
            {detail}
          </p>
          {opened === 'blocked' && url ? (
            <p className="office-viewer-hint">
              请使用下方链接，在新窗口继续阅读。
            </p>
          ) : null}
          {opened === 'opened' && url ? (
            <p className="office-viewer-hint">
              文档内容与访问权限由预览服务确认。也可以再次打开。
            </p>
          ) : null}
          <div className="office-viewer-actions">
            {url ? (
              <Button asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  打开文档 <span aria-hidden="true">↗</span>
                </a>
              </Button>
            ) : null}
            {valid && (config.isError || problem) ? (
              <Button variant="outline" onClick={() => void config.refetch()}>
                重新读取配置
              </Button>
            ) : null}
            <Link to="/basic/home" className="office-viewer-back">
              返回首页 <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
      <footer className="office-viewer-footer">
        <span>学员资料档案室</span>
        <span>OFFICE / VIEWER</span>
      </footer>
    </main>
  )
}
