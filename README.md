# Obsidian S3 Uploader: Maintenance & Architecture Guide

Upload images from your clipboard or drag-and-drop directly to an S3-compatible bucket (Cloudflare R2 supported) and embed the public URL in your notes.
This is based off the Imgur plugin by [gavvvr](https://github.com/gavvvr/obsidian-imgur-plugin)

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

## Failure Points
The most common failure point is a CORS (Cross-Origin Resource Sharing) block. Cloudflare R2 blocks requests from Obsidian by default.
1. The CORS JSON Policy
You must apply this exact policy in your Cloudflare R2 Bucket Settings under the "CORS Policy" section:

```
[
  {
    "AllowedOrigins": [
      "app://obsidian.md",
      "http://localhost"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "DELETE",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]

```
2. API Token Permissions

Ensure the API token generated in Cloudflare has "Object Read & Write" permissions. A "Read Only" token will allow the plugin to connect but will fail every time it attempts to upload a file.

## Notes
- This plugin stores only configuration values in Obsidian settings; it does not ship any secrets.
- You are responsible for bucket permissions and public access configuration.

## Development
- `pnpm install`
- `pnpm run build`

##  Future Improvements

Unique Pathing: Consider adding a setting to prepend a timestamp to filenames (e.g., 20241227-image.png) to prevent overwriting files with identical names.

Progress Bar: For large images, implementing a status bar in the UI can improve the user experience during long uploads.

## License
MIT
