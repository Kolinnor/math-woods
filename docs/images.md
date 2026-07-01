# Image storage

Math Woods stores uploaded images outside the application server. The app issues a short-lived signed upload URL, then the browser uploads directly to an S3-compatible bucket such as Infomaniak Object Storage.

## Infomaniak setup

1. Create an Object Storage bucket, for example `mathwoods-images`.
2. Configure public read access for the published image objects, or expose the bucket through a public CDN/custom domain.
3. Point `images.mathwoods.org` at the public bucket/CDN endpoint.
4. Create an access key with permission to write objects to that bucket.
5. Set the image storage variables in `.env.production` on the server. Do not overwrite unrelated production secrets.

Required variables:

```env
IMAGE_STORAGE_ENDPOINT=https://replace-with-infomaniak-s3-endpoint
IMAGE_STORAGE_REGION=replace-with-infomaniak-region
IMAGE_STORAGE_BUCKET=mathwoods-images
IMAGE_STORAGE_ACCESS_KEY_ID=replace-with-object-storage-access-key
IMAGE_STORAGE_SECRET_ACCESS_KEY=replace-with-object-storage-secret-key
IMAGE_STORAGE_PUBLIC_BASE_URL=https://images.mathwoods.org
IMAGE_STORAGE_PATH_STYLE=1
IMAGE_UPLOAD_MAX_BYTES=5242880
```

`IMAGE_STORAGE_PATH_STYLE=1` signs upload URLs as `/bucket/key`, which is the safest default for S3-compatible providers. Set it to `0` only if the provider requires virtual-hosted bucket URLs like `bucket.example.com/key`.

## Upload flow

Authenticated verified contributors call:

```http
POST /api/images/presign
Content-Type: application/json

{
  "filename": "diagram.png",
  "contentType": "image/png",
  "sizeBytes": 123456
}
```

The response contains a `PUT` URL, required headers, the object key, and the final public URL. The signed URL expires after five minutes.

Only `image/avif`, `image/jpeg`, `image/png`, and `image/webp` are accepted. Files default to 5 MB max. SVG is intentionally excluded because public SVG uploads can carry script-like browser behavior if served incorrectly.

## Caching

Uploaded objects are signed with:

```http
Cache-Control: public, max-age=31536000, immutable
```

Object keys include a random suffix, so replacing an image should create a new URL rather than mutating an existing object. This keeps browser and CDN caching cheap and predictable.
