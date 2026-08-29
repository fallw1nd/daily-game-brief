# Boundary-time validation

For `time_status: "verified"`, `beijingTime` remains the minute-level display value. If that minute equals a fixed window start or end, the trusted publisher must derive a unique second-precision timestamp from the selected opened source metadata. It persists that machine evidence as `timeEvidenceAt` and validates the exact instant against the fixed interval `(windowStart, windowEnd]`.

A boundary-minute source that does not expose second precision cannot be treated as verified; use `time_unverified` instead. This prevents both false rejection immediately after an exclusive start and false inclusion at/after the wrong side of a boundary.
