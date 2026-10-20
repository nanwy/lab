import NiceModal from '@ebay/nice-modal-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { activityKeys, getNoticeCount, getTodoCount } from '../api/activity'
import { NoticesModal } from './Notices'
import { TodosModal } from './TodosModal'

export function ActivityButtons() {
  const notices = useQuery({
    queryKey: activityKeys.noticeCount,
    queryFn: ({ signal }) => getNoticeCount(signal),
    retry: false,
  })
  const todos = useQuery({
    queryKey: activityKeys.todoCount,
    queryFn: ({ signal }) => getTodoCount(signal),
    retry: false,
  })
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          void NiceModal.show(NoticesModal)
        }}
      >
        通知 {notices.isError ? '读取失败' : (notices.data ?? '…')}
      </Button>
      <Button
        variant="outline"
        onClick={() => {
          void NiceModal.show(TodosModal)
        }}
      >
        待办 {todos.isError ? '读取失败' : (todos.data ?? '…')}
      </Button>
    </>
  )
}
