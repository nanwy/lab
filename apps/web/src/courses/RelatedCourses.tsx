import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { getRelatedCourses, type CourseId } from '../api/courses'
import { CourseError } from './CourseFeedback'
import { CourseDialog } from './CourseDialog'

export function RelatedCourses({
  courseId,
  account,
  close,
}: {
  courseId: string
  account: CourseId
  close: () => void
}) {
  const list = useQuery({
    queryKey: ['courses', account, courseId, 'related'],
    queryFn: ({ signal }) => getRelatedCourses(courseId, signal),
    retry: false,
  })
  const navigate = useNavigate()
  return (
    <CourseDialog title="相关课程" close={close}>
      {list.isPending ? (
        <Loading label="正在读取相关课程…" />
      ) : list.isError ? (
        <CourseError
          error={list.error}
          title="相关课程读取失败"
          retry={() => void list.refetch()}
        />
      ) : list.data.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.data.map((course) => (
            <article key={course.id} className="space-y-2 rounded border p-3">
              {course.image ? (
                <img
                  className="aspect-[1.6] w-full object-cover"
                  src={course.image}
                  alt=""
                />
              ) : null}
              <p className="text-sm text-muted-foreground">
                {course.type === 1
                  ? '视频专题'
                  : course.type === 2
                    ? '实验专题'
                    : '混合专题'}
              </p>
              <Button
                variant="link"
                onClick={() =>
                  void navigate({
                    to: '/basic/training/course/$courseId',
                    params: { courseId: String(course.id) },
                  })
                }
              >
                {course.name}
              </Button>
              <span>{course.progress}</span>
              <p className="text-sm">等级：{course.difficulty}星</p>
              <div className="flex flex-wrap gap-2">
                {course.tag_list.map((tag) => (
                  <span key={tag} className="rounded bg-muted px-2 text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="py-12 text-center">暂无相关课程</p>
      )}
    </CourseDialog>
  )
}
