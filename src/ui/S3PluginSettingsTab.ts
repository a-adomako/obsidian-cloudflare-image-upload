import { App, PluginSettingTab, Setting } from 'obsidian'

import S3Plugin from '../S3Plugin'

export default class S3PluginSettingsTab extends PluginSettingTab {
  plugin: S3Plugin

  constructor(app: App, plugin: S3Plugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()
    containerEl.createEl('h2', { text: 'S3 Image Uploader settings' })

    new Setting(containerEl)
      .setName('S3 endpoint')
      .setDesc('Example: https://<account-id>.r2.cloudflarestorage.com')
      .addText((text) =>
        text
          .setPlaceholder('https://<account-id>.r2.cloudflarestorage.com')
          .setValue(this.plugin.settings.s3Endpoint)
          .onChange((value) => {
            this.plugin.settings.s3Endpoint = value.trim()
          }),
      )

    new Setting(containerEl)
      .setName('S3 region')
      .setDesc('Use auto for Cloudflare R2 or the AWS region for S3.')
      .addText((text) =>
        text
          .setPlaceholder('auto')
          .setValue(this.plugin.settings.s3Region)
          .onChange((value) => {
            this.plugin.settings.s3Region = value.trim()
          }),
      )

    new Setting(containerEl)
      .setName('Bucket name')
      .setDesc('The target bucket for uploads.')
      .addText((text) =>
        text
          .setPlaceholder('my-obsidian-bucket')
          .setValue(this.plugin.settings.s3Bucket)
          .onChange((value) => {
            this.plugin.settings.s3Bucket = value.trim()
          }),
      )

    new Setting(containerEl)
      .setName('Access key ID')
      .setDesc('S3 access key with write permission to the bucket.')
      .addText((text) =>
        text
          .setPlaceholder('R2/Access Key ID')
          .setValue(this.plugin.settings.s3AccessKeyId)
          .onChange((value) => {
            this.plugin.settings.s3AccessKeyId = value.trim()
          }),
      )

    new Setting(containerEl)
      .setName('Secret access key')
      .setDesc('Keep this private; stored in Obsidian settings.')
      .addText((text) => {
        text.inputEl.type = 'password'
        return text
          .setPlaceholder('R2/Secret Access Key')
          .setValue(this.plugin.settings.s3SecretAccessKey)
          .onChange((value) => {
            this.plugin.settings.s3SecretAccessKey = value.trim()
          })
      })

    new Setting(containerEl)
      .setName('Public custom domain/URL')
      .setDesc('Public URL prefix used to build image links.')
      .addText((text) =>
        text
          .setPlaceholder('https://images.yourdomain.com')
          .setValue(this.plugin.settings.publicUrlPrefix)
          .onChange((value) => {
            this.plugin.settings.publicUrlPrefix = value.trim()
          }),
      )

    new Setting(containerEl).setName('Confirm before upload').addToggle((t) => {
      t.setValue(this.plugin.settings.showRemoteUploadConfirmation)
      t.onChange((newValue) => {
        this.plugin.settings.showRemoteUploadConfirmation = newValue
      })
    })
  }

  override hide() {
    void this.plugin.saveSettings().then(() => this.plugin.setupImagesUploader())
  }
}
