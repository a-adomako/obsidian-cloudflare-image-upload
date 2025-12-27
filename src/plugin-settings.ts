export interface S3PluginSettings {
  s3Endpoint: string
  s3Region: string
  s3Bucket: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  publicUrlPrefix: string
  showRemoteUploadConfirmation: boolean
}

export const DEFAULT_SETTINGS: S3PluginSettings = {
  s3Endpoint: '',
  s3Region: 'auto',
  s3Bucket: '',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  publicUrlPrefix: '',
  showRemoteUploadConfirmation: true,
}
