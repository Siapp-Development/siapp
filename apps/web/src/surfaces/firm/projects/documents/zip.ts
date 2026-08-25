/**
 * Lightweight, read-only zip-contents inspection for the firm Documents
 * preview (#129). `JSZip.loadAsync` parses the archive's central directory
 * into memory but does NOT decompress entry contents, so listing stays cheap.
 * Files inside the archive are never extracted or rendered.
 */

import JSZip from 'jszip';

/** Zip content types accepted on the upload allowlists (see @siapp/shared). */
export function isZipContentType(mimeType: string): boolean {
  return mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed';
}

export interface IZipEntry {
  path: string;
  isDirectory: boolean;
  sizeBytes: number;
}

/**
 * JSZip's public API does not expose per-entry uncompressed size without
 * decompressing the entry. It lives on the parsed entry's internal `_data`
 * object; we read it via a narrow, well-typed cast (through `unknown`, not
 * `any`) to avoid decompressing every entry just to measure it. Directory
 * entries have no `_data`, so the size defaults to 0.
 */
interface IZipEntryInternalData {
  uncompressedSize?: number;
}

interface IZipEntryInternal {
  _data?: IZipEntryInternalData | null;
}

function readUncompressedSize(entry: JSZip.JSZipObject): number {
  const internal = entry as unknown as IZipEntryInternal;
  const size = internal._data?.uncompressedSize;
  return typeof size === 'number' ? size : 0;
}

/** Parse a zip Blob into a flat, alphabetically-sorted list of entries. */
export async function readZipEntries(blob: Blob): Promise<IZipEntry[]> {
  const archive = await JSZip.loadAsync(blob);
  const entries: IZipEntry[] = [];
  archive.forEach((path, entry) => {
    entries.push({
      path,
      isDirectory: entry.dir,
      sizeBytes: entry.dir ? 0 : readUncompressedSize(entry),
    });
  });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
