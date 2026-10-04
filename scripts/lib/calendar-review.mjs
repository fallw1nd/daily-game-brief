export const calendarFamilies = ["PC", "PlayStation", "Xbox", "Nintendo"];
const receiptSchema = {
  type: "object", additionalProperties: false,
  properties: { key: { type: "string" }, status: { type: "string", enum: ["reviewed", "deferred"] }, reason: { type: "string", minLength: 1 } },
  required: ["key", "status", "reason"],
};
export const calendarReviewSchema = {
  type: "object", additionalProperties: false,
  properties: { pages: { type: "array", items: receiptSchema }, platforms: { type: "array", items: receiptSchema } },
  required: ["pages", "platforms"],
};
export function deferredCalendarReview(work, reason) {
  return { pages: work.pages.map(page => ({ key: page.blobSha, status: "deferred", reason })), platforms: calendarFamilies.map(key => ({ key, status: "deferred", reason })) };
}
export function validateCalendarReview(work, review) {
  if (!work) return [];
  const errors = [];
  for (const [field, required] of [["pages", work.pages.map(page => page.blobSha)], ["platforms", calendarFamilies]]) {
    const rows = review?.[field];
    if (!Array.isArray(rows) || rows.length !== required.length || new Set(rows.map(row => row?.key)).size !== required.length
      || rows.some(row => !required.includes(row?.key) || !["reviewed", "deferred"].includes(row?.status) || !row?.reason?.trim())) {
      errors.push(`calendarReview.${field} must account for every acknowledged ${field} key exactly once, with reviewed/deferred status and a concrete reason`);
    }
  }
  return errors;
}

export function calendarReviewComplete(pageKeys, review) {
  return validateCalendarReview({ pages: pageKeys.map(blobSha => ({ blobSha })) }, review).length === 0
    && [...review.pages, ...review.platforms].every(row => row.status === "reviewed");
}
