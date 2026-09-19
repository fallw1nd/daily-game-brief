# NO.038 release-calendar publisher date normalization

This incident is tracked under the existing `MNT-20260908-02` release-calendar reliability item.

On 2026-09-17 the accepted editorial submission for `2026-09-17-daily` contained three verified `upcoming` patches using the contract date form `YYYY-MM-DD`: Moomintroll: Winter’s Warmth (2026-09-18), EA SPORTS FC 27 (2026-09-25), and Transport Fever 3 (2026-09-29). Editorial validation accepted the submission, but the publisher silently removed all three because `inUpcomingWindow()` only parsed Canonical `MM.DD` values.

The bounded fix makes the publisher window parser accept both contract `YYYY-MM-DD` and Canonical `MM.DD`, applies the full-year value during the 15-day window check, then normalizes surviving dates to `MM.DD` at the Canonical publication boundary. Existing Canonical records remain unchanged. The regression test uses a same-edition Daily revision and proves that an in-window `2026-09-29` patch survives as `09.29` while a `2027-09-29` patch is rejected.

This does not claim complete global release-calendar coverage. Discovery remains partial by design; only verified editorial patches or the separately bounded degraded path may enter Canonical data.
