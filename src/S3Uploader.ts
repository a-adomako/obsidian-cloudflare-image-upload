import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import type { S3PluginSettings } from './plugin-settings'
import ImageUploader from './uploader/ImageUploader'
import { generatePseudoRandomId } from './utils/pseudo-random'

export default class S3Uploader implements ImageUploader {
  private readonly client: S3Client
  private readonly settings: S3PluginSettings

  constructor(settings: S3PluginSettings) {
    this.settings = settings
    this.client = new S3Client({
      endpoint: settings.s3Endpoint,
      region: settings.s3Region,
      credentials: {
        accessKeyId: settings.s3AccessKeyId,
        secretAccessKey: settings.s3SecretAccessKey,
      },
      forcePathStyle: true,
    })
  }

  async upload(image: File): Promise<string> {
    const arrayBuffer = await image.arrayBuffer()
    const key = this.buildObjectKey(image)

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.settings.s3Bucket,
        Key: key,
        Body: new Uint8Array(arrayBuffer),
        ContentType: image.type || undefined,
      }),
    )

    return this.buildPublicUrl(key)
  }

  private buildObjectKey(image: File) {
    const extension = this.fileExtensionFrom(image)
    const suffix = extension ? `.${extension}` : ''
    return `${generatePseudoRandomId()}${suffix}`
  }

  private fileExtensionFrom(image: File) {
    const name = image.name || ''
    const dotIndex = name.lastIndexOf('.')
    if (dotIndex > -1 && dotIndex < name.length - 1) {
      return name.slice(dotIndex + 1)
    }

    if (image.type) {
      const [, ext] = image.type.split('/')
      return ext ?? ''
    }

    return ''
  }

  private buildPublicUrl(key: string) {
    const prefix = this.settings.publicUrlPrefix.trim()
    if (prefix) {
      return `${prefix.replace(/\/$/, '')}/${key}`
    }

    const endpoint = this.settings.s3Endpoint.replace(/\/$/, '')
    return `${endpoint}/${this.settings.s3Bucket}/${key}`
  }
}
