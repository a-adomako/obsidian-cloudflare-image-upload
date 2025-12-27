import { Canvas } from 'obsidian'

import S3Plugin from './S3Plugin'
import ImageUploadBlockingModal from './ui/ImageUploadBlockingModal'
import RemoteUploadConfirmationDialog from './ui/RemoteUploadConfirmationDialog'
import { allFilesAreImages } from './utils/FileList'
import { buildPasteEventCopy } from './utils/events'

export function createS3CanvasPasteHandler(
  plugin: S3Plugin,
  originalPasteHandler: (e: ClipboardEvent) => Promise<void>,
) {
  return function (e: ClipboardEvent) {
    return s3CanvasPaste.call(this, plugin, originalPasteHandler, e)
  }
}

async function s3CanvasPaste(
  plugin: S3Plugin,
  originalPasteHandler: (e: ClipboardEvent) => Promise<void>,
  e: ClipboardEvent,
) {
  const { files } = e.clipboardData
  if (!allFilesAreImages(files) || files.length != 1) {
    void originalPasteHandler.call(this, e)
    return
  }

  if (plugin.settings.showRemoteUploadConfirmation) {
    const modal = new RemoteUploadConfirmationDialog(plugin.app)
    modal.open()

    const userResp = await modal.response()
    switch (userResp.shouldUpload) {
      case undefined:
        return
      case true:
        if (userResp.alwaysUpload) {
          plugin.settings.showRemoteUploadConfirmation = false
          void plugin.saveSettings()
        }
        break
      case false:
        void originalPasteHandler.call(this, e)
        return
      default:
        return
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const canvas: Canvas = this.canvas
  uploadImageOnCanvas(canvas, plugin, buildPasteEventCopy(e, files)).catch(() => {
    void originalPasteHandler.call(this, e)
  })
}

function uploadImageOnCanvas(canvas: Canvas, plugin: S3Plugin, e: ClipboardEvent) {
  const modal = new ImageUploadBlockingModal(plugin.app)
  modal.open()

  const file = e.clipboardData.files[0]
  return plugin.imgUploader
    .upload(file)
    .then((url) => {
      if (!modal.isOpen) {
        return
      }

      modal.close()
      pasteRemoteImageToCanvas(canvas, url)
    })
    .catch((err) => {
      modal.close()
      throw err
    })
}

function pasteRemoteImageToCanvas(canvas: Canvas, imageUrl: string) {
  canvas.createTextNode({
    pos: canvas.posCenter(),
    position: 'center',
    text: `![](${imageUrl})`,
  })
}
