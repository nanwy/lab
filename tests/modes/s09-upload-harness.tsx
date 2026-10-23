import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { FileUpload } from '../../apps/web/src/files/FileUpload'
import '../../apps/web/src/files/files.css'
let root: Root
let host: HTMLDivElement
export function mount() {
  host = document.createElement('div')
  host.className = 'file-drive'
  document.body.replaceChildren(host)
  root = createRoot(host)
  changeDirectory('/资料')
  return root
}

export function changeDirectory(path: string) {
  root.render(
    <FileUpload
      key={path}
      context={{
        path,
        selected: [],
        clearSelection() {},
        async refresh() {
          host.dataset.refreshed = 'yes'
        },
      }}
    />,
  )
}
