import { describe, expect, it } from 'vitest';

import { validateCollabFile } from './useCollabTask.ts';

describe('validateCollabFile', () => {
  it('accepts zip files within size limits (#87)', () => {
    expect(validateCollabFile({ size: 1024, type: 'application/zip' })).toBeNull();
    expect(validateCollabFile({ size: 1024, type: 'application/x-zip-compressed' })).toBeNull();
  });

  it('rejects unsupported mime types', () => {
    expect(validateCollabFile({ size: 1024, type: 'application/x-msdownload' })).toBe(
      'unsupported',
    );
  });
});
