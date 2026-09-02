export function resolveAdjacentManifestItem({ editions = [], windowId, latestId }) {
  const currentIndex = editions.findIndex((item) => item?.id === windowId);
  if (currentIndex > 0) return editions[currentIndex - 1];
  if (currentIndex === 0) return null;
  return editions.find((item) => item?.id === latestId) || null;
}
