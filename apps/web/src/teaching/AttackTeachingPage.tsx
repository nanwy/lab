import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import { RichContentReadOnly } from '../content/RichContentEditor'
import { teachingData } from './data'
import { TopicPractice } from './TopicPractice'
import { LocalAssessment } from './LocalAssessment'

export function AttackTeachingPage() {
  return (
    <Tabs defaultValue="video">
      <TabsList variant="line" aria-label="攻击教学">
        <TabsTrigger value="video">教学视频</TabsTrigger>
        <TabsTrigger value="course">教学课件</TabsTrigger>
        <TabsTrigger value="practice">习题练习</TabsTrigger>
        <TabsTrigger value="manual">实验操作</TabsTrigger>
        <TabsTrigger value="assessment">考核评估</TabsTrigger>
      </TabsList>
      <TabsContent value="video">
        <TeachingMedia kind="video" />
      </TabsContent>
      <TabsContent value="course">
        <TeachingMedia kind="course" />
      </TabsContent>
      <TabsContent value="practice">
        <TopicPractice />
      </TabsContent>
      <TabsContent value="manual">
        <TeachingManual />
      </TabsContent>
      <TabsContent value="assessment">
        <LocalAssessment />
      </TabsContent>
    </Tabs>
  )
}
function TeachingMedia({ kind }: { kind: 'video' | 'course' }) {
  const items =
    kind === 'video' ? teachingData.videoList : teachingData.courseList
  const [selected, setSelected] = useState(items[0])
  return (
    <div className="flex min-h-[32rem] gap-3">
      <aside className="w-[300px] shrink-0 border-r p-2">
        <h3 className="mb-3 font-semibold">攻击模拟教学</h3>
        {items.map((item, index) => (
          <Button
            key={item.id}
            variant={item.id === selected?.id ? 'secondary' : 'ghost'}
            className="h-auto w-full justify-start whitespace-normal text-left"
            onClick={() => setSelected(item)}
          >
            {index + 1}、{item.name}
          </Button>
        ))}
        {!items.length ? <p>无相关视频</p> : null}
      </aside>
      <div className="min-w-0 flex-1 p-3">
        {selected ? (
          kind === 'video' ? (
            <video
              key={selected.id}
              className="h-full w-full"
              src={selected.url}
              controls
              autoPlay
            />
          ) : (
            <iframe
              key={selected.id}
              title={selected.name}
              className="h-full min-h-[32rem] w-full border-0"
              src={selected.url}
            />
          )
        ) : (
          <p>无相关视频</p>
        )}
      </div>
    </div>
  )
}
function TeachingManual() {
  const [selected, setSelected] = useState(teachingData.expManual[0])
  return (
    <div className="flex min-h-[32rem] gap-3">
      <aside className="w-[300px] shrink-0 border-r p-2">
        <h3 className="mb-3 font-semibold">攻击模拟实验</h3>
        {teachingData.expManual.map((item, index) => (
          <Button
            key={item.id}
            variant={item.id === selected?.id ? 'secondary' : 'ghost'}
            className="h-auto w-full justify-start whitespace-normal text-left"
            onClick={() => setSelected(item)}
          >
            {index + 1}、{item.name}
          </Button>
        ))}
        {!teachingData.expManual.length ? <p>无相关视频</p> : null}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto p-3">
        {selected ? (
          <RichContentReadOnly value={selected.handbook} />
        ) : (
          <p>无相关手册</p>
        )}
      </div>
    </div>
  )
}
