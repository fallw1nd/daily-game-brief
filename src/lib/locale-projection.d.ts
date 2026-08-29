export const FACTS_PROJECTION_VERSION: 1;
export const UPCOMING_KEY_VERSION: 1;
export function stableJson(value: unknown): string;
export function upcomingKey(editionId: string, item: unknown): string;
export function assetKey(ownerId: string, asset: unknown): string;
export function factsProjection(edition: unknown, sharedFactFrameDigests?: Record<string, string>): unknown;
export function canonicalCopyProjection(edition: unknown): unknown;
export function localeProjection(overlay: unknown): unknown;
export function editorialDecisionProjection(editorial: unknown): unknown;
