import { S3PluginSettings } from 'src/plugin-settings'

import S3Uploader from '../S3Uploader'
import ImageUploader from './ImageUploader'

export default function buildUploaderFrom(settings: S3PluginSettings): ImageUploader | undefined {
  if (
    !settings.s3Endpoint ||
    !settings.s3Region ||
    !settings.s3Bucket ||
    !settings.s3AccessKeyId ||
    !settings.s3SecretAccessKey
  ) {
    return undefined
  }

  return new S3Uploader(settings)
}
