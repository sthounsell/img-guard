"use strict";

const { toValidationResult } = require("../src/validationResult");

describe("toValidationResult", () => {
  it("returns Passed when the Classification is New", () => {
    expect(
      toValidationResult({ type: "New", distance: null, matchedEntry: null }),
    ).toBe("Passed");
  });

  it("returns Failed when the Classification is Exact", () => {
    expect(
      toValidationResult({ type: "Exact", distance: 0, matchedEntry: {} }),
    ).toBe("Failed");
  });

  it("returns Failed when the Classification is Similar", () => {
    expect(
      toValidationResult({ type: "Similar", distance: 4, matchedEntry: {} }),
    ).toBe("Failed");
  });
});
