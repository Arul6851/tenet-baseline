import type { ValidationStatus, Violation } from "@tenet/contracts";

export const deriveValidationStatus = (
  violations: readonly Violation[],
): ValidationStatus => {
  if (
    violations.some(
      (violation) =>
        violation.enforcement === "block_merge" &&
        (violation.status === "active" || violation.status === "blocked"),
    )
  ) {
    return "BLOCK";
  }

  if (violations.length > 0) {
    return "WARN";
  }

  return "PASS";
};
