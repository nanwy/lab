import { useEffect, useEffectEvent, useState } from 'react'
/** 原倒计时按收到的秒数建立截止时间；卸载只清本地计时，不触发完成动作。 */
export function CourseCountdown({
  seconds,
  onFinish,
}: {
  seconds: number
  onFinish: () => void
}) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil(seconds)))
  const finish = useEffectEvent(onFinish)
  useEffect(() => {
    const end = Date.now() + Math.max(0, seconds) * 1000
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((end - Date.now()) / 1000)))
    const interval = setInterval(tick, 1000)
    const timeout = setTimeout(
      () => {
        clearInterval(interval)
        setRemaining(0)
        finish()
      },
      Math.max(0, seconds) * 1000,
    )
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [seconds])
  const time = [
    Math.floor(remaining / 3600),
    Math.floor(remaining / 60) % 60,
    remaining % 60,
  ]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')
  return <span role="timer">{time}</span>
}
