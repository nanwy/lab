import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { contentAddress } from './content'

const id = z.union([z.string().min(1), z.number().finite()])
export type CourseId = z.infer<typeof id>
const address = z.string().transform(contentAddress)
const strings = z
  .array(z.string())
  .nullish()
  .transform((v) => v ?? [])
const courseCard = z.object({
  id,
  name: z.string(),
  type: z.number(),
  image: address.nullish().or(z.literal('')),
  progress: z.union([z.string(), z.number()]).nullish(),
  difficulty: z.number().optional(),
  grade: z.union([z.string(), z.number()]).optional(),
  tag_list: strings,
})
const detail = z.object({
  id,
  name: z.string(),
  difficulty: z.number().optional(),
  mode: z.union([z.literal(1), z.literal(2)]),
  is_collect: z.boolean(),
  course_direction_list: strings,
})
const section = z.object({
  id,
  name: z.string(),
  type: z.union([z.literal(1), z.literal(2)]),
  video_length: z.string().nullish(),
  finish_rate: z.number().nullish(),
  finish: z.boolean().optional(),
  play_count: z.number().optional(),
  attachment: z
    .object({
      lecture: address.nullish().or(z.literal('')),
      section_attachment: address.nullish().or(z.literal('')),
      tool_attachment: address.nullish().or(z.literal('')),
    })
    .nullish(),
  video_attachment: address.nullish().or(z.literal('')),
})
const catalog = z.array(
  z.union([
    z.object({ id, name: z.string(), section: z.array(section) }),
    section,
  ]),
)
export type CourseCard = z.infer<typeof courseCard>
export type CourseDetail = z.infer<typeof detail>
export type CourseSection = z.infer<typeof section>
export type CourseCatalog = z.infer<typeof catalog>
export const courseBase = '/front/learn/task/self_study/open_courses/'
export const coursePath = (courseId: CourseId) =>
  `${courseBase}${encodeURIComponent(courseId)}/`

async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  return parse(schema, await apiClient.request(path, { signal }), path)
}
function parse<T>(schema: z.ZodType<T>, value: unknown, path: string) {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      `课程响应契约错误：${path.split('?')[0]}（${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join('; ')}）`,
    )
  return parsed.data
}
async function post<T>(
  schema: z.ZodType<T>,
  path: string,
  json: unknown,
  signal?: AbortSignal,
) {
  return parse(
    schema,
    await apiClient.request(path, {
      method: 'POST',
      json,
      signal,
      isBusinessFailure: (value) =>
        z.object({ status: z.literal(2) }).safeParse(value).success,
    }),
    path,
  )
}
export type CourseFilter = {
  page: number
  size: number
  search: string
  directions: string[]
  tag: string[]
  difficulty: number[]
  type: number[]
  grade: string[]
  complete: string[]
  position: CourseId[]
}
export const initialCourseFilter: CourseFilter = {
  page: 1,
  size: 12,
  search: '',
  directions: [],
  tag: [],
  difficulty: [],
  type: [],
  grade: [],
  complete: [],
  position: [],
}
export function getCourses(filter: CourseFilter, signal?: AbortSignal) {
  const query = new URLSearchParams({
    page: String(filter.page),
    size: String(filter.size),
  })
  if (filter.search !== '') query.set('search', filter.search)
  for (const [key, values] of Object.entries({
    tag: [...filter.tag, ...filter.directions],
    difficulty: filter.difficulty,
    type: filter.type,
    grade: filter.grade,
    complete: filter.complete,
    position: filter.position,
  }))
    for (const value of values) query.append(key, String(value))
  return read(
    z.object({
      count: z.number().int().nonnegative(),
      results: z.array(courseCard),
    }),
    `${courseBase}list/?${query}`,
    signal,
  )
}
export function getCourseFilters(signal?: AbortSignal) {
  return read(
    z.object({
      category_lists: z.array(z.string()),
      course_direction_lists: strings,
    }),
    `${courseBase}filter/`,
    signal,
  )
}
export function getCourse(courseId: CourseId, signal?: AbortSignal) {
  return read(detail, coursePath(courseId), signal)
}
export function getCourseCatalog(courseId: CourseId, signal?: AbortSignal) {
  return read(catalog, `${coursePath(courseId)}catalog/`, signal)
}
export function courseSections(items: CourseCatalog): CourseSection[] {
  return items.flatMap((item) => ('section' in item ? item.section : [item]))
}

const material = z
  .object({
    id,
    name: z.string(),
    path: z.string(),
    is_file: z.union([z.literal(0), z.literal(1)]),
    attached: address.nullish(),
    type: z.string().optional(),
    size: z
      .union([
        z.number().nonnegative(),
        z
          .string()
          .refine(
            (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0,
          )
          .transform(Number),
      ])
      .nullish()
      .transform((v) => v ?? 0),
    altertime: z.string().nullish(),
    isLink: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional(),
  })
  .superRefine((file, ctx) => {
    if (file.is_file && !file.attached)
      ctx.addIssue({
        code: 'custom',
        path: ['attached'],
        message: '文件缺少下载地址',
      })
  })
export type CourseMaterial = z.infer<typeof material>
export async function getCourseMaterials(
  courseId: CourseId,
  path: string,
  signal?: AbortSignal,
) {
  const files = await read(
    z.array(material),
    `${coursePath(courseId)}resource/?parent_path=${encodeURIComponent(path)}`,
    signal,
  )
  if (new Set(files.map((file) => String(file.id))).size !== files.length)
    throw new ApiError('invalid-response', '课程资料响应存在重复行标识')
  return files.filter((file) => file.id !== '..')
}

export function changeCourseCollection(
  courseId: CourseId,
  collected: boolean,
  signal?: AbortSignal,
) {
  return post(
    z.object({ status: z.literal(1) }),
    collected ? '/front/user/collect/batch/' : '/front/user/collect/',
    collected
      ? { attribute: 1, ids: [courseId] }
      : { attribute: 1, object_id: courseId },
    signal,
  )
}
export async function getRelatedCourses(
  courseId: CourseId,
  signal?: AbortSignal,
) {
  return (
    await read(
      z.object({ status: z.literal(1), data: z.array(courseCard) }),
      `${coursePath(courseId)}recommend/`,
      signal,
    )
  ).data
}
const reply = z.object({
  username: z.string(),
  role: z.number().optional(),
  created: z.string().nullish(),
  content: z.string(),
  logo: address.nullish().or(z.literal('')),
})
const comment = reply.extend({ id, comment: z.array(reply) })
export type CourseComment = z.infer<typeof comment>
export function getCourseComments(
  courseId: CourseId,
  page: number,
  signal?: AbortSignal,
) {
  return read(
    z.object({
      count: z.number().int().nonnegative(),
      results: z.array(comment),
    }),
    `${coursePath(courseId)}comment/?page=${page}&size=10`,
    signal,
  )
}
export const courseCommentSchema = z.object({
  content: z.string().min(1, '请输入评论内容！'),
})
export function addCourseComment(
  courseId: CourseId,
  content: string,
  commentId: CourseId | undefined,
  signal?: AbortSignal,
) {
  const body = courseCommentSchema.parse({ content })
  return post(
    z.object({ content: z.string().min(1) }),
    `${coursePath(courseId)}comment/${commentId === undefined ? '' : `${encodeURIComponent(commentId)}/`}`,
    body,
    signal,
  )
}
export function deleteCourseComment(
  courseId: CourseId,
  commentId: CourseId,
  signal?: AbortSignal,
) {
  return post(
    z.object({ status: z.literal(1) }),
    `${coursePath(courseId)}comment/delete/`,
    { level1: [commentId] },
    signal,
  )
}
