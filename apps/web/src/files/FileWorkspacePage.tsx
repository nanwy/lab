import { FileDrivePage } from './FileDrivePage'
import { FileUpload } from './FileUpload'
import {
  PersonalFileActions,
  PersonalFileRowActions,
} from './PersonalFileActions'

export function FileWorkspacePage() {
  return (
    <FileDrivePage
      personalActions={(context) => (
        <>
          <FileUpload context={context} />
          <PersonalFileActions context={context} />
        </>
      )}
      rowActions={(file, context) => (
        <PersonalFileRowActions file={file} context={context} />
      )}
    />
  )
}
