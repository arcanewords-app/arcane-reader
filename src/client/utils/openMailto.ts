export interface OpenMailtoOptions {
  to: string;
  subject?: string;
  body?: string;
}

/** Build a mailto: href with encoded query params. */
export function buildMailtoHref({ to, subject, body }: OpenMailtoOptions): string {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return query ? `mailto:${to}?${query}` : `mailto:${to}`;
}

/**
 * Open the default mail client via a transient anchor click.
 * Prefer this over window.location.href for mailto: links.
 */
export function openMailto(options: OpenMailtoOptions): void {
  const href = buildMailtoHref(options);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
