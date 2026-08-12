export type ImageUploadErrorPayload = {
  code?: unknown;
  error?: unknown;
};

function payloadError(payload: ImageUploadErrorPayload | null | undefined) {
  return typeof payload?.error === "string" && payload.error.trim() ? payload.error.trim() : null;
}

export function imageUploadResponseError(
  status: number,
  payload?: ImageUploadErrorPayload | null
) {
  const explicitError = payloadError(payload);
  if (explicitError) return explicitError;

  if (status === 400) return "The server could not read this image. Check its file type and try exporting it again.";
  if (status === 401) return "Your session has expired. Sign in again, then retry the upload.";
  if (status === 403) return "Your account is not allowed to upload images. Check that your email is verified.";
  if (status === 413) return "The server rejected this image because it is too large. Use an image smaller than 5 MB.";
  if (status === 429) return "Too many images were uploaded recently. Wait a few minutes and try again.";
  if (status === 502) return "Math Woods could not send the image to Object Storage. The storage service or its configuration may be unavailable.";
  if (status === 503) return "Image storage is not configured or is temporarily unavailable.";
  if (status >= 500) return `The image upload service failed with server error ${status}.`;
  if (status > 0) return `The image upload was rejected with HTTP status ${status}.`;
  return "The image upload failed for an unknown reason.";
}

export function imageUploadNetworkError(error: unknown) {
  if (error instanceof Error && error.message && !/failed to fetch/i.test(error.message)) return error.message;
  return "The browser could not reach the image upload service. Check your connection and try again.";
}

function objectStorageErrorCode(responseBody: string | null | undefined) {
  const code = responseBody?.match(/<Code>([A-Za-z0-9]+)<\/Code>/)?.[1];
  return code && code.length <= 80 ? code : null;
}

export function objectStorageUploadError(status: number, responseBody?: string | null) {
  const code = objectStorageErrorCode(responseBody);
  if (code === "AccessDenied") return "Object Storage denied write access. Check the bucket permissions for this access key.";
  if (code === "InvalidAccessKeyId") return "Object Storage does not recognize the configured access key.";
  if (code === "SignatureDoesNotMatch") {
    return "Object Storage rejected the request signature. Check the secret key, endpoint, region, and path-style setting.";
  }
  if (code === "NoSuchBucket") return "The configured Object Storage bucket does not exist.";
  if (code === "RequestTimeTooSkewed") return "Object Storage rejected the request because the server clock is incorrect.";
  if (code === "EntityTooLarge") return "Object Storage rejected the image because it is too large.";
  if (code === "SlowDown") return "Object Storage is rate-limiting uploads. Wait a moment and try again.";

  if (status === 400) {
    return "Object Storage rejected the signed request (400). Check the configured endpoint, region, and path-style setting.";
  }
  if (status === 401 || status === 403) {
    return `Object Storage refused the upload (${status}). Check the access keys and the bucket's write permissions.`;
  }
  if (status === 404) {
    return "Object Storage could not find the upload destination (404). Check the endpoint, bucket name, and path-style setting.";
  }
  if (status === 413) return "Object Storage rejected the image because it is too large.";
  if (status === 429) return "Object Storage is rate-limiting uploads. Wait a moment and try again.";
  if (status >= 500) return `Object Storage is temporarily unavailable (HTTP ${status}).`;
  return `Object Storage rejected the upload (HTTP ${status})${code ? `, storage code ${code}` : ""}.`;
}
