/**
 * Inline document preview (#14, #129): images render via <img>, zip archives
 * render an accessible read-only contents listing, PDFs via <iframe>; every
 * other type falls back to a download-only message. All rendered over a
 * rules-enforced blob object URL — the parent owns the URL lifecycle (revokes
 * on close).
 */

import { DWG_CONTENT_TYPE } from '@siapp/shared';
import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { useEffect, useState } from 'react';

import { formatBytes } from './formatBytes.ts';
import { isZipContentType, readZipEntries, type IZipEntry } from './zip.ts';

export interface IDocumentPreviewProps {
  name: string;
  mimeType: string;
  url: string;
  onClose: () => void;
}

export function DocumentPreview({ name, mimeType, url, onClose }: IDocumentPreviewProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-base font-semibold">{name}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </CardHeader>
      <CardContent>
        {mimeType.startsWith('image/') && mimeType !== DWG_CONTENT_TYPE ? (
          <img src={url} alt={name} className="max-h-[70vh] max-w-full rounded-md" />
        ) : isZipContentType(mimeType) ? (
          <ZipContents url={url} name={name} />
        ) : mimeType === 'application/pdf' ? (
          <iframe title={name} src={url} className="h-[70vh] w-full rounded-md border" />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No preview available — download to view.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Zip-contents listing (#129): read-only entry names + uncompressed sizes.
// Files inside the archive are never extracted or rendered.
// ---------------------------------------------------------------------------

type TZipState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: IZipEntry[] };

interface IZipContentsProps {
  url: string;
  name: string;
}

export function ZipContents({ url, name }: IZipContentsProps) {
  const [state, setState] = useState<TZipState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const entries = await readZipEntries(blob);
        if (!cancelled) {
          setState({ status: 'ready', entries });
        }
      } catch {
        if (!cancelled) {
          setState({ status: 'error' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === 'loading') {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Reading archive…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="py-8 text-center text-sm text-destructive">
        This archive could not be read. It may be corrupt — download to view.
      </p>
    );
  }

  if (state.entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">This archive is empty.</p>
    );
  }

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Contents of {name}</caption>
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1.5 pr-3 font-medium">
            Name
          </th>
          <th scope="col" className="py-1.5 pl-3 text-right font-medium">
            Size
          </th>
        </tr>
      </thead>
      <tbody>
        {state.entries.map((entry) => (
          <tr key={entry.path} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pr-3 font-mono">
              {entry.isDirectory && !entry.path.endsWith('/') ? `${entry.path}/` : entry.path}
            </td>
            <td className="py-1.5 pl-3 text-right text-muted-foreground">
              {entry.isDirectory ? '—' : formatBytes(entry.sizeBytes)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
