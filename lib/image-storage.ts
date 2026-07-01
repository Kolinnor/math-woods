import { createHash, createHmac, randomBytes } from "node:crypto";

export const IMAGE_UPLOAD_MAX_BYTES = Number(process.env.IMAGE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
export const IMAGE_UPLOAD_EXPIRES_SECONDS = 5 * 60;
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ALLOWED_IMAGE_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

export type ImageStorageConfig = {
  endpoint: URL;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: URL;
  pathStyle: boolean;
};

type ImageUploadInput = {
  filename: string;
  contentType: string;
  sizeBytes: number;
};

type ImageObjectKeyInput = {
  userId: number;
  filename: string;
  contentType: string;
  now?: Date;
  randomSuffix?: string;
};

export function getImageStorageConfig(): ImageStorageConfig | null {
  const endpoint = process.env.IMAGE_STORAGE_ENDPOINT?.trim();
  const region = process.env.IMAGE_STORAGE_REGION?.trim();
  const bucket = process.env.IMAGE_STORAGE_BUCKET?.trim();
  const accessKeyId = process.env.IMAGE_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.IMAGE_STORAGE_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = process.env.IMAGE_STORAGE_PUBLIC_BASE_URL?.trim();

  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;

  return {
    endpoint: new URL(endpoint),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: new URL(publicBaseUrl),
    pathStyle: process.env.IMAGE_STORAGE_PATH_STYLE !== "0"
  };
}

export function validateImageUploadInput(value: unknown): ImageUploadInput {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const filename = typeof data.filename === "string" ? data.filename.trim() : "";
  const contentType = typeof data.contentType === "string" ? data.contentType.trim().toLowerCase() : "";
  const sizeBytes = typeof data.sizeBytes === "number" ? data.sizeBytes : Number(data.sizeBytes);

  if (!filename || filename.length > 180) {
    throw new Error("Image filename is required and must be at most 180 characters.");
  }

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Only AVIF, JPEG, PNG, and WebP images are supported.");
  }

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > IMAGE_UPLOAD_MAX_BYTES) {
    throw new Error(`Image must be smaller than ${Math.round(IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024)} MB.`);
  }

  return { filename, contentType, sizeBytes };
}

export function buildImageObjectKey({ userId, filename, contentType, now = new Date(), randomSuffix }: ImageObjectKeyInput) {
  const extension = ALLOWED_IMAGE_TYPES.get(contentType);
  if (!extension) throw new Error("Unsupported image content type.");

  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const baseName = filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const safeName = baseName || "image";
  const suffix = randomSuffix ?? randomBytes(8).toString("hex");

  return `uploads/${year}/${month}/user-${userId}/${now.getTime()}-${suffix}-${safeName}.${extension}`;
}

export function publicImageUrl(config: ImageStorageConfig, key: string) {
  const url = new URL(config.publicBaseUrl);
  url.pathname = joinUrlPath(url.pathname, key);
  return url.toString();
}

export function createPresignedImageUpload(config: ImageStorageConfig, key: string, contentType: string, now = new Date()) {
  const uploadUrl = objectStorageUrl(config, key);
  const amzDate = awsDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = "cache-control;content-type;host";
  const expires = String(IMAGE_UPLOAD_EXPIRES_SECONDS);

  uploadUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  uploadUrl.searchParams.set("X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`);
  uploadUrl.searchParams.set("X-Amz-Date", amzDate);
  uploadUrl.searchParams.set("X-Amz-Expires", expires);
  uploadUrl.searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalRequest = [
    "PUT",
    canonicalUri(uploadUrl.pathname),
    canonicalQueryString(uploadUrl.searchParams),
    `cache-control:${IMAGE_CACHE_CONTROL}\ncontent-type:${contentType}\nhost:${uploadUrl.host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacHex(signingKey(config.secretAccessKey, dateStamp, config.region), stringToSign);

  uploadUrl.searchParams.set("X-Amz-Signature", signature);

  return {
    url: uploadUrl.toString(),
    method: "PUT",
    key,
    publicUrl: publicImageUrl(config, key),
    expiresAt: new Date(now.getTime() + IMAGE_UPLOAD_EXPIRES_SECONDS * 1000).toISOString(),
    headers: {
      "Cache-Control": IMAGE_CACHE_CONTROL,
      "Content-Type": contentType
    }
  };
}

function objectStorageUrl(config: ImageStorageConfig, key: string) {
  const endpoint = new URL(config.endpoint);
  if (config.pathStyle) {
    endpoint.pathname = joinUrlPath(endpoint.pathname, config.bucket, key);
    return endpoint;
  }

  endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  endpoint.pathname = joinUrlPath(endpoint.pathname, key);
  return endpoint;
}

function joinUrlPath(...parts: string[]) {
  return `/${parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;
}

function awsDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalUri(pathname: string) {
  return pathname
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function canonicalQueryString(params: URLSearchParams) {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}
