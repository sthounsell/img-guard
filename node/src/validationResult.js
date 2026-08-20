"use strict";

/**
 * A thin, optional pass/fail view over Classification for consumers that
 * don't need the full New/Exact/Similar detail (CONTEXT.md's
 * "ValidationResult") — Passed when the candidate is New, Failed when it's
 * Exact or Similar. Not a first-class output of the Rust core or the Node
 * orchestration layer; one guess at a likely consumer use case (a live
 * upload-validation gate), not a confirmed requirement.
 *
 * @param {{ type: "New"|"Exact"|"Similar" }} classification
 * @returns {"Passed"|"Failed"}
 */
function toValidationResult(classification) {
  return classification.type === "New" ? "Passed" : "Failed";
}

module.exports = { toValidationResult };
