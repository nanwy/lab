import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import Hls, { ErrorDetails, ErrorTypes, Events } from 'hls.js'
import { toast } from '@workspace/ui/components/sonner'
import { addCourseVideoLog, type CourseId } from '../api/courses'
import { reportCourseError } from './CourseFeedback'

export type CourseVideoHandle = {
  pauseAndGetTime: () => number
  seek: (time: number) => void
}
export function CourseVideo({
  courseId,
  sectionId,
  src,
  finished,
  breakpointTime,
  ref,
}: {
  courseId: CourseId
  sectionId: CourseId
  src: string
  finished: boolean
  breakpointTime?: number
  ref: Ref<CourseVideoHandle>
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const manualPause = useRef(false)
  const pendingSeek = useRef(breakpointTime)
  const finishedRef = useRef(finished)
  useEffect(() => {
    finishedRef.current = finished
  }, [finished])
  useImperativeHandle(
    ref,
    () => ({
      pauseAndGetTime() {
        manualPause.current = true
        videoRef.current?.pause()
        return videoRef.current?.currentTime ?? 0
      },
      seek(time) {
        pendingSeek.current = time
        if (videoRef.current && videoRef.current.readyState > 0)
          videoRef.current.currentTime = time
      },
    }),
    [],
  )
  useEffect(() => {
    const video = videoRef.current!
    const controller = new AbortController()
    const fragments = new Map<string, { duration: number; revision: number }>()
    let revision = 0
    let seeking = false
    let pauseRecoveries = 0
    let lastRecovery = -Infinity
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (fn: () => void, time: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (!controller.signal.aborted) fn()
      }, time)
      timers.add(timer)
    }
    const hls = Hls.isSupported()
      ? new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        })
      : null
    async function send() {
      if (!fragments.size || !Number.isFinite(video.duration)) return
      const snapshot = new Map(fragments)
      try {
        await addCourseVideoLog(
          courseId,
          sectionId,
          Object.fromEntries(
            [...snapshot].map(([url, value]) => [url, value.duration]),
          ),
          Math.floor(video.duration),
          controller.signal,
        )
        if (controller.signal.aborted) return
        for (const [url, value] of snapshot)
          if (fragments.get(url)?.revision === value.revision)
            fragments.delete(url)
      } catch (error) {
        reportCourseError(error, controller.signal)
      }
    }
    const onMetadata = () => {
      if (pendingSeek.current !== undefined) {
        video.currentTime = pendingSeek.current
        pendingSeek.current = undefined
      }
    }
    const onPointer = () => {
      manualPause.current = true
      pauseRecoveries = 0
    }
    const onSeeking = () => {
      seeking = true
      pauseRecoveries = 0
    }
    const onSeeked = () =>
      later(() => {
        seeking = false
      }, 200)
    const onPause = () => {
      if (manualPause.current || seeking) {
        manualPause.current = false
        return
      }
      if (!video.ended && pauseRecoveries < 1) {
        pauseRecoveries += 1
        void video.play().catch(() => {})
      }
    }
    let interval: ReturnType<typeof setInterval> | undefined
    const onEnded = () => {
      if (hls) void send()
      clearInterval(interval)
    }
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('pointerdown', onPointer)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    if (hls) {
      hls.on(Events.FRAG_LOADED, (_, { frag }) =>
        fragments.set(frag.relurl!, {
          duration: frag.duration,
          revision: ++revision,
        }),
      )
      hls.on(Events.ERROR, (_, data) => {
        if (controller.signal.aborted) return
        if (data.fatal) {
          if (data.type === ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else if (data.type === ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
        }
        if (
          data.details === ErrorDetails.BUFFER_STALLED_ERROR &&
          Date.now() - lastRecovery > 1000
        ) {
          lastRecovery = Date.now()
          if (video.currentTime + 1 < video.duration) video.currentTime += 1
          void video.play().catch(() => {})
          toast.warning('视频缓冲中，请稍后')
          later(() => {
            hls.startLoad()
            hls.recoverMediaError()
          }, 2000)
        } else if (
          String(data.details) === 'fragLoopLoadingError' ||
          data.details === ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === ErrorDetails.MANIFEST_PARSING_ERROR
        )
          hls.startLoad()
      })
      hls.loadSource(src)
      hls.attachMedia(video)
      interval = setInterval(() => {
        if (!finishedRef.current) void send()
      }, 40_000)
    } else video.src = src
    return () => {
      controller.abort()
      clearInterval(interval)
      for (const timer of timers) clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('pointerdown', onPointer)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [courseId, sectionId, src])
  return (
    <video
      ref={videoRef}
      aria-label="课程视频"
      className="aspect-video w-full bg-black"
      controls
      preload="metadata"
    />
  )
}
