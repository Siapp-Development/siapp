/**
 * Inline document preview (#14): images render via <img>, PDFs via <iframe>,
 * both over a rules-enforced blob object URL. The parent owns the URL
 * lifecycle (revokes on close).
 */

import { Button, Card, CardContent, CardHeader } from '@siapp/ui';

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
        {mimeType.startsWith('image/') ? (
          <img src={url} alt={name} className="max-h-[70vh] max-w-full rounded-md" />
        ) : (
          <iframe title={name} src={url} className="h-[70vh] w-full rounded-md border" />
        )}
      </CardContent>
    </Card>
  );
}
