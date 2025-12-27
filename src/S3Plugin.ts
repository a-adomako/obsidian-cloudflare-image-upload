import {
  CanvasView,
  Editor,
  EditorPosition,
  MarkdownFileInfo,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  ReferenceCache,
  TFile,
} from 'obsidian'

import { createS3CanvasPasteHandler } from './Canvas'
import DragEventCopy from './aux-event-classes/DragEventCopy'
import PasteEventCopy from './aux-event-classes/PasteEventCopy'
import { DEFAULT_SETTINGS, S3PluginSettings } from './plugin-settings'
import S3PluginSettingsTab from './ui/S3PluginSettingsTab'
import InfoModal from './ui/InfoModal'
import RemoteUploadConfirmationDialog from './ui/RemoteUploadConfirmationDialog'
import UpdateLinksConfirmationModal from './ui/UpdateLinksConfirmationModal'
import ApiError from './uploader/ApiError'
import ImageUploader from './uploader/ImageUploader'
import buildUploaderFrom from './uploader/imgUploaderFactory'
import { allFilesAreImages } from './utils/FileList'
import { findLocalFileUnderCursor, replaceFirstOccurrence } from './utils/editor'
import { fixImageTypeIfNeeded, removeReferenceIfPresent } from './utils/misc'
import {
  filesAndLinksStatsFrom,
  getAllCachedReferencesForFile,
  replaceAllLocalReferencesWithRemoteOne,
} from './utils/obsidian-vault'
import { generatePseudoRandomId } from './utils/pseudo-random'

interface LocalImageInEditor {
  image: {
    file: TFile
    start: EditorPosition
    end: EditorPosition
  }
  editor: Editor
  noteFile: TFile
}

export default class S3Plugin extends Plugin {
  _settings: S3PluginSettings

  get settings() {
    return this._settings
  }

  private _imgUploader: ImageUploader

  get imgUploader(): ImageUploader {
    return this._imgUploader
  }

  private readonly inFlightUploads = new Set<string>()

  private customPasteEventCallback = async (
    e: ClipboardEvent,
    _: Editor,
    markdownView: MarkdownView,
  ) => {
    if (e instanceof PasteEventCopy) return

    const { files } = e.clipboardData ?? { files: null }
    if (!files || !allFilesAreImages(files)) return

    e.preventDefault()
    e.stopPropagation()

    if (!this.imgUploader) {
      S3Plugin.showUnconfiguredPluginNotice()
      return
    }

    if (this._settings.showRemoteUploadConfirmation) {
      const modal = new RemoteUploadConfirmationDialog(this.app)
      modal.open()

      const userResp = await modal.response()
      switch (userResp.shouldUpload) {
        case undefined:
          return
        case true:
          if (userResp.alwaysUpload) {
            this._settings.showRemoteUploadConfirmation = false
            void this.saveSettings()
          }
          break
        case false:
          markdownView.currentMode.clipboardManager.handlePaste(new PasteEventCopy(e))
          return
        default:
          return
      }
    }

    let errorNotified = false
    for (const file of files) {
      const uploadKey = this.uploadKeyFor(file)
      if (this.inFlightUploads.has(uploadKey)) continue
      this.inFlightUploads.add(uploadKey)
      this.uploadFileAndEmbedRemoteImage(file)
        .catch((err) => {
          if (!errorNotified) {
            new Notice('S3 upload failed. Check Developer Tools for details.')
            errorNotified = true
          }
          console.error('S3 upload failed', err)
        })
        .finally(() => {
          this.inFlightUploads.delete(uploadKey)
        })
    }
  }

  private customDropEventListener = async (e: DragEvent, _: Editor, markdownView: MarkdownView) => {
    if (e instanceof DragEventCopy) return

    if (e.dataTransfer?.types.length !== 1 || e.dataTransfer.types[0] !== 'Files') {
      return
    }

    // Preserve files before showing modal, otherwise they will be lost from the event
    const { files } = e.dataTransfer
    if (!allFilesAreImages(files)) return

    e.preventDefault()
    e.stopPropagation()

    if (!this.imgUploader) {
      S3Plugin.showUnconfiguredPluginNotice()
      return
    }

    if (this._settings.showRemoteUploadConfirmation) {
      const modal = new RemoteUploadConfirmationDialog(this.app)
      modal.open()

      const userResp = await modal.response()
      switch (userResp.shouldUpload) {
        case undefined:
          return
        case true:
          if (userResp.alwaysUpload) {
            this._settings.showRemoteUploadConfirmation = false
            void this.saveSettings()
          }
          break
        case false: {
          markdownView.currentMode.clipboardManager.handleDrop(DragEventCopy.create(e, files))
          return
        }
        default:
          return
      }
    }

    // Adding newline to avoid messing images pasted via default handler
    // with any text added by the plugin
    this.activeEditor.replaceSelection('\n')

    const promises: Promise<any>[] = []
    let errorNotified = false
    for (const image of files) {
      const uploadKey = this.uploadKeyFor(image)
      if (this.inFlightUploads.has(uploadKey)) continue
      this.inFlightUploads.add(uploadKey)
      const uploadPromise = this.uploadFileAndEmbedRemoteImage(image)
        .catch((err) => {
          if (!errorNotified) {
            new Notice('S3 upload failed. Check Developer Tools for details.')
            errorNotified = true
          }
          console.error('S3 upload failed', err)
        })
        .finally(() => {
          this.inFlightUploads.delete(uploadKey)
        })
      promises.push(uploadPromise)
    }

    await Promise.all(promises)
  }

  private s3PluginRightClickHandler = (menu: Menu, editor: Editor, view: MarkdownView) => {
    const localFile = findLocalFileUnderCursor(editor, view)
    if (!localFile) return

    menu.addItem((item) => {
      item
        .setTitle('Upload to S3')
        .setIcon('wand')
        .onClick(() => this.doUploadLocalImage({ image: localFile, editor, noteFile: view.file }))
    })
  }

  private async doUploadLocalImage(imageInEditor: LocalImageInEditor) {
    const { image, editor, noteFile } = imageInEditor
    const { file: imageFile, start, end } = image
    try {
      const imageUrl = await this.uploadLocalImageFromEditor(editor, imageFile, start, end)
      if (!imageUrl) return
      this.proposeToReplaceOtherLocalLinksIfAny(imageFile, imageUrl, {
        path: noteFile.path,
        startPosition: start,
      })
    } catch (err) {
      new Notice('S3 upload failed. Check Developer Tools for details.')
      console.error('S3 upload failed', err)
    }
  }

  private proposeToReplaceOtherLocalLinksIfAny(
    originalLocalFile: TFile,
    remoteImageUrl: string,
    originalReference: { path: string; startPosition: EditorPosition },
  ) {
    const otherReferencesByNote = this.getAllCachedReferencesForFile(originalLocalFile)
    this.removeReferenceToOriginalNoteIfPresent(otherReferencesByNote, originalReference)

    const notesWithSameLocalFile = Object.keys(otherReferencesByNote)
    if (notesWithSameLocalFile.length === 0) return

    this.showLinksUpdateDialog(originalLocalFile, remoteImageUrl, otherReferencesByNote)
  }

  private getAllCachedReferencesForFile(file: TFile) {
    return getAllCachedReferencesForFile(this.app.metadataCache)(file)
  }

  private removeReferenceToOriginalNoteIfPresent = (
    referencesByNote: Record<string, ReferenceCache[]>,
    originalNoteRef: { path: string; startPosition: EditorPosition },
  ) => removeReferenceIfPresent(referencesByNote, originalNoteRef)

  private showLinksUpdateDialog(
    localFile: TFile,
    remoteImageUrl: string,
    otherReferencesByNote: Record<string, ReferenceCache[]>,
  ) {
    const stats = filesAndLinksStatsFrom(otherReferencesByNote)
    const dialogBox = new UpdateLinksConfirmationModal(this.app, localFile.path, stats)
    dialogBox.onDoNotUpdateClick(() => dialogBox.close())
    dialogBox.onDoUpdateClick(() => {
      dialogBox.disableButtons()
      dialogBox.setContent('Working...')
      replaceAllLocalReferencesWithRemoteOne(this.app.vault, otherReferencesByNote, remoteImageUrl)
        .catch((e) => {
          new InfoModal(
            this.app,
            'Error',
            'Unexpected error occurred, check Developer Tools console for details',
          ).open()
          console.error('Something bad happened during links update', e)
        })
        .finally(() => dialogBox.close())
      new Notice(`Updated ${stats.linksCount} links in ${stats.filesCount} files`)
    })
    dialogBox.open()
  }

  private async uploadLocalImageFromEditor(
    editor: Editor,
    file: TFile,
    start: EditorPosition,
    end: EditorPosition,
  ) {
    const arrayBuffer = await this.app.vault.readBinary(file)
    const fileToUpload = new File([arrayBuffer], file.name)
    const uploadKey = this.uploadKeyFor(fileToUpload)
    if (this.inFlightUploads.has(uploadKey)) return
    this.inFlightUploads.add(uploadKey)
    editor.replaceRange('\n', end, end)
    let imageUrl: string
    try {
      imageUrl = await this.uploadFileAndEmbedRemoteImage(fileToUpload, {
        ch: 0,
        line: end.line + 1,
      })
    } finally {
      this.inFlightUploads.delete(uploadKey)
    }
    editor.replaceRange(`<!--${editor.getRange(start, end)}-->`, start, end)
    return imageUrl
  }

  private async loadSettings() {
    this._settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as S3PluginSettings),
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this._settings)
  }

  override onload() {
    void this.initPlugin()
  }

  private async initPlugin() {
    await this.loadSettings()
    this.addSettingTab(new S3PluginSettingsTab(this.app, this))

    this.setupImagesUploader()
    this.setupUploadHandlers()
    this.addUploadLocalCommand()
  }

  setupImagesUploader(): void {
    const uploader = buildUploaderFrom(this._settings)
    this._imgUploader = uploader
    if (!uploader) return

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalUploadFunction = uploader.upload
    uploader.upload = function (image: File, albumId?: string) {
      if (!uploader) return
      return originalUploadFunction.call(uploader, fixImageTypeIfNeeded(image), albumId)
    }
  }

  private setupUploadHandlers() {
    this.registerEvent(this.app.workspace.on('editor-paste', this.customPasteEventCallback))
    this.registerEvent(this.app.workspace.on('editor-drop', this.customDropEventListener))
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        const { view } = leaf

        if (view.getViewType() === 'canvas') {
          this.overridePasteHandlerForCanvasView(view as CanvasView)
        }
      }),
    )

    this.registerEvent(this.app.workspace.on('editor-menu', this.s3PluginRightClickHandler))
  }

  private overridePasteHandlerForCanvasView(view: CanvasView) {
    const originalPasteFn = view.handlePaste
    view.handlePaste = createS3CanvasPasteHandler(this, originalPasteFn)
  }

  private addUploadLocalCommand() {
    this.addCommand({
      id: 's3-upload-local',
      name: 'Upload to S3',
      editorCheckCallback: this.editorCheckCallbackForLocalUpload,
    })
  }

  private editorCheckCallbackForLocalUpload = (
    checking: boolean,
    editor: Editor,
    ctx: MarkdownFileInfo,
  ) => {
    const localFile = findLocalFileUnderCursor(editor, ctx)
    if (!localFile) return false
    if (checking) return true

    void this.doUploadLocalImage({ image: localFile, editor, noteFile: ctx.file })
  }

  private static showUnconfiguredPluginNotice() {
    const fiveSecondsMillis = 5_000
    new Notice('⚠️ Please configure S3 settings for the uploader plugin', fiveSecondsMillis)
  }

  private async uploadFileAndEmbedRemoteImage(file: File, atPos?: EditorPosition) {
    const pasteId = generatePseudoRandomId()
    this.insertTemporaryText(pasteId, atPos)

    let imgUrl: string
    try {
      imgUrl = await this.imgUploader.upload(file)
    } catch (e) {
      if (e instanceof ApiError) {
        this.handleFailedUpload(
          pasteId,
          `Upload failed, remote server returned an error: ${e.message}`,
        )
      } else {
        console.error('Failed S3 request: ', e)
        this.handleFailedUpload(pasteId, '⚠️S3 upload failed, check dev console')
      }
      throw e
    }
    this.embedMarkDownImage(pasteId, imgUrl)
    return imgUrl
  }

  private insertTemporaryText(pasteId: string, atPos?: EditorPosition) {
    const progressText = S3Plugin.progressTextFor(pasteId)
    const replacement = `${progressText}\n`
    const editor = this.activeEditor
    if (atPos) {
      editor.replaceRange(replacement, atPos, atPos)
    } else {
      editor.replaceSelection(replacement)
    }
  }

  private static progressTextFor(id: string) {
    return `![Uploading file...${id}]()`
  }

  private embedMarkDownImage(pasteId: string, imageUrl: string) {
    const progressText = S3Plugin.progressTextFor(pasteId)
    const markDownImage = `![](${imageUrl})`

    replaceFirstOccurrence(this.activeEditor, progressText, markDownImage)
  }

  private handleFailedUpload(pasteId: string, message: string) {
    const progressText = S3Plugin.progressTextFor(pasteId)
    replaceFirstOccurrence(this.activeEditor, progressText, `<!--${message}-->`)
  }

  private get activeEditor(): Editor {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView)
    return mdView.editor
  }

  private uploadKeyFor(file: File) {
    return `${file.name}:${file.size}:${file.type}:${file.lastModified}`
  }
}
