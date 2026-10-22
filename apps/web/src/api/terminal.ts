import { ApiError } from './client'

export type TextConsoleType = 'docker' | 'vpcs'

// 原调用方的类型映射；操作机web_socker.type与节点config_info.type均显式传入。
export function textConsoleType(
  type: unknown,
  consoleType?: unknown,
): TextConsoleType | undefined {
  if (type === 'docker' || type === 'docker_webide') return 'docker'
  if (['vpcs', 'dynamips', 'qemu'].includes(String(type))) return 'vpcs'
  if (
    ['libvirt', 'libvirt_middle_intercept'].includes(String(type)) &&
    consoleType === 'telnet'
  )
    return 'vpcs'
}

export function validateTextConsole(
  type: string,
  id: unknown,
): asserts id is string {
  if (!['docker', 'vpcs'].includes(type))
    throw new ApiError('business', '不支持的文本终端类型')
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    ['undefined', 'null'].includes(id) ||
    Array.from(id).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new ApiError('business', '缺少有效的节点连接标识')
}

export function textConsoleHref(type: TextConsoleType, id: unknown) {
  validateTextConsole(type, id)
  return `${window.location.pathname}#/vnccontrol/${type}/${encodeURIComponent(id)}`
}

export function connectTextConsole(type: TextConsoleType, id: string) {
  validateTextConsole(type, id)
  const protocol = window.location.protocol === 'http:' ? 'ws:' : 'wss:'
  const path = type === 'docker' ? 'dockerssh' : 'vpcssh'
  return new WebSocket(
    `${protocol}//${window.location.host}/ws/${path}/${encodeURIComponent(id)}/`,
  )
}
