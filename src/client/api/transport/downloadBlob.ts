import { apiErrorFromBody, parseApiErrorFromResponse } from '../errors.js';

export function parseContentDispositionFilename(
  contentDisposition: string | null,
  fallback: string
): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/);
  return match?.[1] || fallback;
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}

/** Fetch authenticated blob and trigger browser download. */
export async function downloadBlob(
  url: string,
  options: { token?: string | null; fallbackFilename: string; failureMessage?: string }
): Promise<{ filename: string }> {
  const res = await fetch(url, {
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
  });
  if (!res.ok) {
    const errData = await parseApiErrorFromResponse(res);
    throw apiErrorFromBody(
      errData,
      res.status,
      errData.error || res.statusText || options.failureMessage || 'Download failed'
    );
  }
  const blob = await res.blob();
  const filename = parseContentDispositionFilename(
    res.headers.get('Content-Disposition'),
    options.fallbackFilename
  );
  triggerBrowserDownload(blob, filename);
  return { filename };
}
