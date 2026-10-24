export function formatBytes(size: number) {
  if (!size) return '0 B'
  const level = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4)
  return `${(size / 1024 ** level).toFixed(level ? 2 : 0)} ${['B', 'KB', 'MB', 'GB', 'TB'][level]}`
}

export function FileTypeGlyph({
  file,
}: {
  file: { name: string; isLink?: boolean; is_file: boolean | number }
}) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const type = !file.is_file
    ? 'folder'
    : file.isLink
      ? 'link'
      : Object.hasOwn(fileTypeByExtension, extension)
        ? fileTypeByExtension[extension]!
        : 'other'
  const { label, mark } = fileTypeGlyphs[type]
  return (
    <span
      className={`file-glyph ${type === 'folder' ? 'file-folder' : ''}`}
      role="img"
      aria-label={`文件类型：${label}`}
    >
      <svg
        width="22"
        height="26"
        viewBox="0 0 24 28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        aria-hidden="true"
      >
        {type === 'folder' ? (
          <path d="M2 8h8l2 3h10v13H2V8Z" />
        ) : type === 'link' ? (
          <path d="m10 18 5-5m-7 1-2 2a4 4 0 0 0 6 6l3-3m1-5 2-2a4 4 0 0 0-6-6l-3 3" />
        ) : (
          <>
            <path d="M4 2h10l6 6v18H4V2Zm10 0v6h6" />
            {type === 'image' ? (
              <path d="m5 22 5-7 4 4 3-3 3 6M8 10h1v1H8z" />
            ) : (
              <text
                x="12"
                y="20"
                textAnchor="middle"
                fill="currentColor"
                stroke="none"
                fontSize={mark.length > 2 ? 6 : 9}
                fontFamily="ui-monospace, monospace"
              >
                {mark}
              </text>
            )}
          </>
        )}
      </svg>
    </span>
  )
}
const fileTypeGlyphs = {
  folder: { label: '文件夹', mark: '' },
  link: { label: '链接', mark: '' },
  word: { label: 'Word 文档', mark: 'W' },
  excel: { label: '电子表格', mark: 'X' },
  image: { label: '图片', mark: '' },
  markdown: { label: 'Markdown 文档', mark: 'M↓' },
  pdf: { label: 'PDF 文档', mark: 'PDF' },
  text: { label: '文本文件', mark: 'TXT' },
  archive: { label: '压缩包', mark: 'ZIP' },
  other: { label: '文件', mark: '···' },
} as const
const fileTypeByExtension: Record<string, keyof typeof fileTypeGlyphs> = {
  doc: 'word',
  docx: 'word',
  xls: 'excel',
  xlsx: 'excel',
  bmp: 'image',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  tif: 'image',
  gif: 'image',
  pcx: 'image',
  tga: 'image',
  exif: 'image',
  svg: 'image',
  psd: 'image',
  ai: 'image',
  webp: 'image',
  md: 'markdown',
  pdf: 'pdf',
  txt: 'text',
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
  tgz: 'archive',
}
