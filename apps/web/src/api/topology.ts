import { apiClient, ApiError } from './index'
import { ZodError } from 'zod'
import {
  fromX6Graph,
  toX6Graph,
  type EditorGraph,
} from '../topology/x6-adapter'

export async function getExperimentTopology(
  id: string | number,
  signal?: AbortSignal,
): Promise<EditorGraph> {
  const path = `/front/topo/${encodeURIComponent(id)}/draw/?task_type=6`
  const raw = await apiClient.request(path, { signal })
  try {
    return fromX6Graph(raw)
  } catch (error) {
    const details =
      error instanceof ZodError
        ? error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join('.')}:${issue.code}`)
            .join('; ')
        : 'graph:invalid'
    throw new ApiError(
      'invalid-response',
      `${path.split('?')[0]} 响应不符合 X6 图契约（${details}）`,
    )
  }
}

export async function saveExperimentTopology(
  id: string | number,
  graph: EditorGraph,
  signal?: AbortSignal,
  lastNode?: Array<string | number>,
): Promise<void> {
  if (graph.rawGraph.lock)
    throw new ApiError('business', '拓扑已锁定，无法保存。')
  await apiClient.request(
    `/front/topo/${encodeURIComponent(id)}/draw/?task_type=6`,
    {
      method: 'POST',
      json: {
        topo: toX6Graph(graph),
        ...(lastNode?.length ? { last_node: lastNode } : {}),
      },
      signal,
      isBusinessFailure: (value) => !value,
    },
  )
}
