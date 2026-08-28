export function generatedEditorialAlt(record) {
  const title = record.title?.title_zh_cn || record.title?.title_en || record.id;
  return `${title}：${record.headline || "相关消息"}相关配图`;
}

export function refreshGeneratedEditorialAlts(record, localizeAlt) {
  const expected = generatedEditorialAlt(record);
  let changed = 0;

  for (const image of record.images || []) {
    if (image?.kind !== "editorial" || typeof image.alt !== "string") continue;
    const localized = localizeAlt(image.alt);
    if (localized !== expected || image.alt === expected) continue;
    image.alt = expected;
    changed += 1;
  }

  return changed;
}
