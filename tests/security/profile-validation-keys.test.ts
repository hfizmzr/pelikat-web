import { describe, it, expect } from "vitest";
import { profileSaveErrors } from "@/lib/profile-validation";

// Regression: Object.keys(errors).length was 2 even when validation passed,
// because profileSaveErrors returned explicit `undefined` keys. The save gate
// (`Object.keys(errors).length === 0`) therefore ALWAYS failed, blocking a
// fully-valid profile save with a bare "Please fix the highlighted fields".
describe("profileSaveErrors key contract", () => {
  it("returns a truly empty object (no keys) when validation passes", () => {
    const errors = profileSaveErrors("Runner Three T3", true);
    expect(Object.keys(errors)).toHaveLength(0);
    expect(errors).toEqual({}); // toEqual alone is NOT sufficient (ignores undefined)
  });

  it("returns real keys when validation fails", () => {
    expect(Object.keys(profileSaveErrors("", true))).toContain("full_name");
    expect(Object.keys(profileSaveErrors("Ok Name", false))).toContain("pdpa");
  });
});
