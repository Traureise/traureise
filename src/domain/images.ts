/** Upload rules, shared by the server-side use case and the browser-side pre-check. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export type UploadProblem = "invalid_type" | "empty" | "too_large";

export function checkUpload(file: { size: number; contentType: string }): UploadProblem | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.contentType)) return "invalid_type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "too_large";
  return null;
}

/** Where the app serves an uploaded image. */
export function uploadPath(key: string): string {
  return `/uploads/${key}`;
}
