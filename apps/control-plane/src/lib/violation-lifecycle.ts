/**
 * Computes the deterministic lifecycle transition for logical violations.
 *
 * The database owns the actual update, but keeping this decision pure makes
 * the important "missing from a later run means resolved" rule directly
 * testable without a database connection.
 */
export interface ActiveViolationFingerprint {
  id: string;
  fingerprint: string;
}

export const resolvedViolationFingerprints = (
  activeViolations: readonly ActiveViolationFingerprint[],
  incomingFingerprints: ReadonlySet<string>,
): readonly string[] =>
  activeViolations
    .filter((violation) => !incomingFingerprints.has(violation.fingerprint))
    .map((violation) => violation.fingerprint)
    .sort((left, right) => left.localeCompare(right));

export const resolvedViolationIds = (
  activeViolations: readonly ActiveViolationFingerprint[],
  incomingFingerprints: ReadonlySet<string>,
): readonly string[] =>
  activeViolations
    .filter((violation) => !incomingFingerprints.has(violation.fingerprint))
    .map((violation) => violation.id);
