import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { activityKeys, getTodos } from '../api/activity'

export const todosOptions = queryOptions({
  queryKey: [...activityKeys.todos, 'all'],
  queryFn: ({ signal }) => getTodos(signal),
  retry: false,
})
export function refreshNotices(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: activityKeys.notices }),
    client.invalidateQueries({ queryKey: activityKeys.noticeCount }),
  ])
}
export function refreshTodos(client: QueryClient) {
  return client.invalidateQueries({ queryKey: activityKeys.todos })
}
