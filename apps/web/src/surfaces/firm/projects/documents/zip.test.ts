/**
 * #129: readZipEntries parses a zip Blob into a flat, sorted entry list with
 * uncompressed sizes (never decompressing/extracting entry contents), and
 * isZipContentType gates the zip preview branch. Built with real jszip so the
 * internal `_data.uncompressedSize` read path is exercised end-to-end.
 */

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { isZipContentType, readZipEntries } from './zip.ts';

async function buildZip(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('b.txt', 'hello'); // 5 bytes
  zip.file('a/c.txt', 'hi'); // 2 bytes, creates the 'a/' directory entry
  return zip.generateAsync({ type: 'blob' });
}

describe('isZipContentType', () => {
  it('is true for both accepted zip content types and false for everything else', () => {
    expect(isZipContentType('application/zip')).toBe(true);
    expect(isZipContentType('application/x-zip-compressed')).toBe(true);
    expect(isZipContentType('application/pdf')).toBe(false);
    expect(isZipContentType('image/vnd.dwg')).toBe(false);
    expect(isZipContentType('')).toBe(false);
  });
});

describe('readZipEntries', () => {
  it('returns alphabetically-sorted entries with paths and uncompressed sizes', async () => {
    const entries = await readZipEntries(await buildZip());

    expect(entries.map((e) => e.path)).toEqual(['a/', 'a/c.txt', 'b.txt']);

    const dir = entries.find((e) => e.path === 'a/');
    expect(dir?.isDirectory).toBe(true);
    expect(dir?.sizeBytes).toBe(0);

    const file = entries.find((e) => e.path === 'b.txt');
    expect(file?.isDirectory).toBe(false);
    expect(file?.sizeBytes).toBe(5);

    const nested = entries.find((e) => e.path === 'a/c.txt');
    expect(nested?.isDirectory).toBe(false);
    expect(nested?.sizeBytes).toBe(2);
  });

  it('resolves to an empty list for an archive with no entries', async () => {
    const empty = await new JSZip().generateAsync({ type: 'blob' });
    expect(await readZipEntries(empty)).toEqual([]);
  });

  it('rejects on corrupt / non-zip input so the preview error branch triggers', async () => {
    const corrupt = new Blob(['this is definitely not a zip archive']);
    await expect(readZipEntries(corrupt)).rejects.toBeDefined();
  });
});
