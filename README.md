# Cloudflare R2 / S3 Image Uploader for Obsidian

Upload images from your clipboard or drag-and-drop directly to an S3-compatible bucket (Cloudflare R2 supported) and embed the public URL in your notes.

## Features
- Paste and drag-and-drop image uploads
- Optional confirmation dialog before uploading
- Works with Cloudflare R2 and standard S3-compatible storage

## Setup
1. Install the plugin in Obsidian.
2. Open plugin settings and fill in:
   - S3 endpoint (R2 example: `https://<account-id>.r2.cloudflarestorage.com`)
   - S3 region (`auto` for R2 or your AWS region)
   - Bucket name
   - Access key ID and secret access key
   - Public custom domain/URL (the public prefix used for image URLs)

## Notes
- This plugin stores only configuration values in Obsidian settings; it does not ship any secrets.
- You are responsible for bucket permissions and public access configuration.

## Development
- `pnpm install`
- `pnpm run build`

## License
MIT
