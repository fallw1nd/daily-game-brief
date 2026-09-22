# Showcase Completion

Use this path only when durable state has an open `revisionRequest` with `reason:"showcase_completion"` and the acknowledged packet has `continuation.scope:"showcase"` plus `preservePublished:true`.

Ordinary news continuations use `editorial_continuation` and exact event-key scope. User-authorized manual revisions use their own revision authorization. These authorities are not interchangeable.

## Rules

- Current Canonical/liveness work outranks showcase completion.
- Restore the exact packet blob and original edition window. Later-discovered facts cannot be pulled backward into the old window.
- Every scoped showcase fact must map to a new entry, the confirmed same existing fact, a supported non-substantive exclusion, or `needs_review`.
- `existingEntryId` requires confirmed same-fact identity; matching only game name or source URL is insufficient.
- Preserve existing entries, human revisions, issue/window, archive title, lead entry, calendar, and prior English. Showcase submissions do not carry calendar changes.
- Region/platform/date differences remain explicit.
- Partial sources, Highlights-only material, or unresolved subject identity cannot be presented as complete coverage.
- GitHub owns queue activation, fairness, retries, and state transactions. The editorial task never edits queue state directly.

The same-edition publisher must remain idempotent: supplementation cannot roll `latest` backward, allocate a new issue number, or delete unrelated verified content.
