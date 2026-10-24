import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { profileIcBlockReason, PROFILE_INCOMPLETE_MESSAGE } from "@/lib/profile-validation"

/**
 * Red-first for the retro-merge audit fix 2: `icBlockReason` on the runner
 * profile page was derived from UNSAVED live form state, while the server
 * action (`storeEncryptedIc`) validates the SAVED DB row. A runner whose
 * form LOOKED complete could get the misleading PROFILE_INCOMPLETE error
 * from the server. The UI gate must be semantics-aware: derive block state
 * from the last SAVED profile snapshot, with save-first wording when the
 * snapshot is incomplete.
 */

const pagePath = join(process.cwd(), "src", "app", "runner", "profile", "page.tsx")
const page = readFileSync(pagePath, "utf-8")

describe("IC gate derives from saved snapshot (not live form state)", () => {
  it("keeps a lastSavedProfile snapshot captured at fetch and updated after save", () => {
    expect(page).toContain("lastSavedProfile")
    // Snapshot is seeded from the DB row in fetchProfile…
    expect(page).toMatch(/setLastSavedProfile\(\{[\s\S]*?data\./)
    // …and refreshed after a successful save (before navigation).
    expect(page).toMatch(/setLastSavedProfile\(\{[\s\S]*?formData\./)
  })

  it("derives icBlockReason from the saved snapshot, not live formData", () => {
    const blockReasonSource = page.slice(
      page.indexOf("const icBlockReason"),
      page.indexOf("const [icInput")
    )
    expect(blockReasonSource).toContain("lastSavedProfile")
    // The old bug: live form fields fed the gate directly.
    expect(blockReasonSource).not.toMatch(/full_name: formData\./)
    expect(blockReasonSource).not.toMatch(/dob: formData\./)
  })

  it("uses save-first wording for an incomplete SAVED profile", () => {
    expect(page).toContain("Save your profile before uploading your document")
  })

  it("server action authority is unchanged (no bypass in the page)", () => {
    // The gate is UX-only; storeEncryptedIc still validates the DB row.
    expect(page).toContain("storeEncryptedIc")
  })
})

describe("saved-snapshot semantics via the pure helper", () => {
  it("a saved-complete snapshot raises no block", () => {
    expect(
      profileIcBlockReason({
        full_name: "Ali Bin Abu",
        dob: "1990-01-01",
        gender: "M",
        pdpa_agreed: true,
      })
    ).toBeNull()
  })

  it("an incomplete saved snapshot still blocks (save-first gate)", () => {
    expect(
      profileIcBlockReason({
        full_name: "Ali Bin Abu",
        dob: null,
        gender: "",
        pdpa_agreed: true,
      })
    ).toBe(PROFILE_INCOMPLETE_MESSAGE)
  })
})
