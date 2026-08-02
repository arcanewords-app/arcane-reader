export function isJobBasedUploadFormat(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.epub') || lower.endsWith('.fb2') || lower.endsWith('.csv');
}
