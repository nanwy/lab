import { z } from 'zod'
import { apiClient, ApiError } from './index'

export type DesktopType = 'vnc' | 'rdp'
export function validateDesktop(
  type: string,
  id: unknown,
): asserts id is string {
  if (type !== 'vnc' && type !== 'rdp')
    throw new ApiError('business', '不支持的图形控制台类型')
  if (
    typeof id !== 'string' ||
    !id.trim() ||
    id === 'undefined' ||
    id === 'null'
  )
    throw new ApiError('business', '缺少有效的节点连接标识')
}
export function desktopHref(type: DesktopType, id: unknown, name: string) {
  validateDesktop(type, id)
  return `${window.location.pathname}#/kvmvnc/${type}/${encodeURIComponent(id)}/${encodeURIComponent(name)}`
}
export function desktopSocketUrl(type: DesktopType, id: string) {
  validateDesktop(type, id)
  return `${window.location.protocol === 'http:' ? 'ws:' : 'wss:'}//${window.location.host}/ws/kvm${type}/${encodeURIComponent(id)}/`
}
export async function prepareRdp(id: string, signal?: AbortSignal) {
  return apiClient.request(
    `/front/topo/node_run/${encodeURIComponent(id)}/rdp/`,
    {
      signal,
      isBusinessFailure: (value) =>
        z.object({ status: z.literal(1) }).safeParse(value).success === false,
    },
  )
}
export async function getNoVncUrl(id: string, signal?: AbortSignal) {
  const value = await apiClient.request(
    `/front/topo/node_run/${encodeURIComponent(id)}/novnc/`,
    {
      signal,
      isBusinessFailure: (value) =>
        !z.object({ status: z.literal(1) }).safeParse(value).success,
    },
  )
  const parsed = z
    .object({ data: z.object({ novnc_url: z.string().min(1) }) })
    .safeParse(value)
  if (!parsed.success)
    throw new ApiError('invalid-response', '未返回noVNC地址！')
  const url = new URL(parsed.data.data.novnc_url, window.location.href)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ApiError('invalid-response', 'noVNC地址协议无效')
  return url.href
}
export const desktopErrors: Record<number, string> = {
  256: '未支持的访问',
  512: '远程服务异常，请检查目标设备能否正常访问。',
  513: '服务器忙碌',
  514: '服务器连接超时',
  515: '远程服务异常',
  516: '资源未找到',
  517: '资源冲突',
  518: '资源已关闭',
  519: '远程服务未找到',
  520: '远程服务不可用',
  521: '会话冲突',
  522: '会话连接超时',
  523: '会话已关闭',
  768: '网络不可达',
  769: '服务器密码验证失败',
  771: '客户端被禁止',
  776: '客户端连接超时',
  781: '客户端异常',
  783: '错误的请求类型',
  800: '会话不存在',
  801: '创建隧道失败，请检查Guacd服务是否正常。',
  802: '管理员强制关闭了此会话',
}
