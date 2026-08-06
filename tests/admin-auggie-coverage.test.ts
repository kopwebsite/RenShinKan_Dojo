import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { adminAuggieToolCatalogue } from "../functions/_lib/adminAuggie";

// This is the Admin Auggie administration coverage map, kept as an executable
// contract. Every administration write endpoint must be consciously classified
// here, so a NEW write endpoint added to the site cannot quietly ship without a
// decision about whether Admin Auggie covers it. That is what keeps the
// coverage from rotting as the site grows.
//
// Values:
//   a tool name  -> Admin Auggie can drive this endpoint through the reviewed
//                   delegation layer, so a chat request reaches the same code a
//                   page does, with the same permission and transaction rules.
//   "page-only"  -> deliberately kept out of the chat: passwords and sign-in,
//                   the audit-log record itself, and the internal publishing
//                   machinery Auggie reaches a different way.
//   "gap: ..."   -> should be reachable from the chat but is not built yet.

// A file with more than one write method (a PUT and a DELETE, say) lists one
// tool per method, so closing the gap on one method cannot hide that another is
// still uncovered.
const COVERAGE: Record<string, string | string[]> = {
  // Covered — one Auggie tool per reviewed delegation route.
  "contributions.ts": "propose_contribution_status",
  "dojos.ts": "propose_dojo_settings",
  "examinations.ts": "propose_examination_status",
  "examinations/[applicationId].ts": "propose_examination_rejection",
  "galleries.ts": "propose_gallery_album_update",
  "newsletters/actions.ts": "propose_newsletter_lifecycle",
  "newsletters/save.ts": "propose_newsletter_create",
  "newsletters/send.ts": "propose_newsletter_send",
  "payment-proofs.ts": "propose_payment_proof_decision",
  "site-content.ts": "propose_site_page_visibility",
  "students/bulk.ts": "propose_bulk_student_action",
  "students/index.ts": "propose_student_create",
  // One file, two write methods: PUT edits the record, DELETE erases it forever.
  "students/[id].ts": ["propose_student_record_update", "propose_student_deletion"],
  "students/[id]/exam.ts": "propose_student_examination",
  "students/[id]/hours.ts": "propose_student_hours",
  "students/[id]/profile-status.ts": "propose_student_profile_decision",

  // Deliberately not in the chat.
  "audit-cleanup.ts": "page-only", // deleting/cleaning the audit-log record
  "login.ts": "page-only", // passwords and sign-in
  "logout.ts": "page-only", // sign-in / session
  "select-dojo.ts": "page-only", // sign-in dojo selection
  "publish.ts": "page-only", // Auggie publishes through site-content
  "publish-reconcile.ts": "page-only", // internal publishing recovery

  // Known gaps — should be reachable from the chat, not built yet.
  "diagnostics.ts": "gap: site health check is not yet a tool",
  "downloads.ts": "gap: downloads area is not yet a tool",
  "gallery-media.ts": "gap: gallery photo upload (stage 4)",
  "memberships.ts": "gap: memberships are not yet a tool",
  "newsletters/test.ts": "gap: newsletter test-send is not yet a tool",
  "site-media.ts": "gap: site media upload (stage 4)",
  "students/upload.ts": "gap: student photo upload (stage 4)",
  "students/[id]/application.ts": "gap: admin exam application is not yet a tool",
  "students/[id]/hours-requests.ts":
    "gap: approving training-hour requests is not yet a tool",
  "students/[id]/share.ts": "gap: student share links are not yet a tool",
  "switch-dojo.ts": "gap: switching the working dojo is not yet a tool",
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adminApiDir = resolve(root, "functions/api/admin");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Every administration endpoint that accepts a write (POST, PUT or DELETE),
// except Admin Auggie's own endpoints, which are the assistant, not a target.
function writeEndpoints(): string[] {
  return walk(adminApiDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => relative(adminApiDir, file).replace(/\\/g, "/"))
    .filter((rel) => !rel.startsWith("auggie/"))
    .filter((rel) =>
      /export const onRequest(Post|Put|Delete)\b/.test(
        readFileSync(resolve(adminApiDir, rel), "utf8"),
      ),
    )
    .sort();
}

describe("Admin Auggie administration coverage map", () => {
  it("classifies every administration write endpoint", () => {
    const unclassified = writeEndpoints().filter((path) => !(path in COVERAGE));
    // If this fails, a new administration write endpoint was added. Decide in
    // COVERAGE above whether Admin Auggie covers it, or keep it page-only, so
    // the coverage cannot quietly rot.
    expect(unclassified).toEqual([]);
  });

  it("has no stale entries pointing at endpoints that no longer exist", () => {
    const endpoints = new Set(writeEndpoints());
    const stale = Object.keys(COVERAGE).filter((path) => !endpoints.has(path));
    expect(stale).toEqual([]);
  });

  it("names a real, permitted tool for every covered endpoint", () => {
    const toolNames = new Set(
      adminAuggieToolCatalogue("renshinkan_super_admin").map(
        (entry) => entry.function.name,
      ),
    );
    for (const [path, value] of Object.entries(COVERAGE)) {
      for (const name of Array.isArray(value) ? value : [value]) {
        if (name === "page-only" || name.startsWith("gap:")) continue;
        expect(toolNames.has(name), `${path} -> ${name}`).toBe(true);
      }
    }
  });
});
