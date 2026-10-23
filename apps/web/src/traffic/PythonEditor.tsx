import { useEffect, useEffectEvent, useRef } from 'react'
import ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-python'
import 'ace-builds/src-noconflict/theme-github'
import 'ace-builds/src-noconflict/ext-language_tools'
import 'ace-builds/src-noconflict/snippets/python'

export function PythonEditor({
  value,
  readOnly,
  onChange,
  onBlur,
}: {
  value: string
  readOnly: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const applying = useRef(false)
  const editor = useRef<ace.Ace.Editor | null>(null)
  const change = useEffectEvent(onChange)
  const blur = useEffectEvent(onBlur)
  useEffect(() => {
    const instance = ace.edit(container.current!, {
      mode: 'ace/mode/python',
      theme: 'ace/theme/github',
      fontSize: 14,
      showGutter: true,
      highlightActiveLine: true,
      showPrintMargin: false,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
      useWorker: false,
      tabSize: 2,
      textInputAriaLabel: '拦截代码',
      placeholder: '请填写拦截代码',
    })
    instance.textInput.getElement().setAttribute('aria-label', '拦截代码')
    editor.current = instance
    instance.on('change', () => {
      if (!applying.current) change(instance.getValue())
    })
    instance.on('blur', () => blur())
    return () => {
      editor.current = null
      instance.destroy()
    }
  }, [])
  useEffect(() => {
    if (editor.current && editor.current.getValue() !== value) {
      applying.current = true
      editor.current.setValue(value, -1)
      applying.current = false
    }
  }, [value])
  useEffect(() => {
    editor.current?.setReadOnly(readOnly)
  }, [readOnly])
  return <div ref={container} className="h-[300px] w-full border" />
}
