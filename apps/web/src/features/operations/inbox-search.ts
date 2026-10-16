/** Search only records already admitted by the caller's visibility filter. */
export function matchesInboxQuery(record: Record<string, any>, query: string): boolean {
  const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const origins = Array.isArray(record.origins) ? record.origins : [];
  const attachmentNames=(value:unknown)=>Array.isArray(value)?value.map(item=>item?.filename):[];
  const text = [record.title, record.text, record.rawText, record.originalText, record.annotation,
    record.sourceUrl, record.materialText, ...attachmentNames(record.attachments),
    record.terminal, record.terminalId, ...(Array.isArray(record.tags) ? record.tags : []),
    ...origins.flatMap((origin: Record<string, unknown>) => [origin.rawText, origin.terminalId,origin.sourceUrl,origin.materialText,...attachmentNames(origin.attachments)])]
    .map(normalize).join('\n');
  return terms.every(term => text.includes(term));
}
