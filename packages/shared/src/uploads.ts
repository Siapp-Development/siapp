/**
 * Upload content-type helpers shared across all upload surfaces (#129).
 *
 * Browsers report the MIME type of `.dwg` (AutoCAD) files inconsistently
 * (often `''`, sometimes `application/octet-stream`/`application/acad`), so
 * every upload path normalizes by filename extension before validating and
 * before writing the Storage `contentType` / Firestore `mimeType`.
 */

/** IANA-registered content type pinned for `.dwg` uploads. */
export const DWG_CONTENT_TYPE = 'image/vnd.dwg';

/**
 * Pin the IANA-registered `image/vnd.dwg` for `.dwg` files (browsers report
 * their MIME inconsistently); pass every other type through unchanged.
 */
export function resolveUploadContentType(fileName: string, browserType: string): string {
  if (fileName.toLowerCase().endsWith('.dwg')) {
    return DWG_CONTENT_TYPE;
  }
  return browserType;
}
