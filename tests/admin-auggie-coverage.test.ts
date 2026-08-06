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
//   "panel-upload: <tool>"
//                -> the Auggie panel uploads a file straight through this
//                   reviewed media endpoint (an image upload cannot travel the
//                   JSON delegation layer), and the returned media id is then
//                   referenced by <tool> in a proposal the administrator
//                   confirms. Still the same reviewed endpoint, same admin-only
//                   permission — just reached by the panel, not by delegation.
//   "gap: ..."   -> should be reachable from the chat but is not built yet.

// A file with more than one write method (a PUT and a DELETE, say) lists one
// tool per method, so closing the gap on one method cannot hide that another is
// still uncovered.
const COVERAGE: Record<string, string | string[]> = {
  // Covered — one Auggie tool per reviewed delegation route.
  "contributions.ts": "propose_contribution_status",
  // One file, two write methods: PUT edits a dojo, POST creates a new one.
  "dojos.ts": ["propose_dojo_settings", "propose_dojo_create"],
  "examinations.ts": "propose_examination_status",
  "examinations/[applicationId].ts": "propose_examination_rejection",
  "galleries.ts": "propose_gallery_album_update",
  "memberships.ts": "propose_membership_payment",
  "newsletters/actions.ts": "propose_newsletter_lifecycle",
  "newsletters/save.ts": "propose_newsletter_create",
  "newsletters/send.ts": "propose_newsletter_send",
  "payment-proofs.ts": "propose_payment_proof_decision",
  // One file, three write tools: the PUT saves page visibility and page words,
  // the POST publishes the whole draft. Editing the words is a separate proposal
  // from publishing, which stays its own confirmed step.
  "site-content.ts": [
    "propose_site_page_visibility",
    "propose_site_page_text",
    "propose_site_publish",
  ],
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
  // Switching the working dojo is the signed session's own scope, set at sign-in;
  // the site moved to a per-page dojo filter and this endpoint is a removed stub.
  // switch_working_dojo recognises the request in chat and points to the page,
  // but it is never a chat write, so this stays page-only.
  "switch-dojo.ts": "page-only",
  "publish.ts": "page-only", // Auggie publishes through site-content
  "publish-reconcile.ts": "page-only", // internal publishing recovery

  // Panel uploads — the attach control uploads a file through the reviewed
  // endpoint, then the result is referenced in a proposal.
  "gallery-media.ts": "panel-upload: propose_gallery_photo_add",
  "site-media.ts": "panel-upload: propose_newsletter_create",
  // Downloads has four write methods. Editing the record (PATCH) and retiring it
  // (DELETE) travel the JSON delegation layer as reviewed proposals. Adding a new
  // PDF (POST) and replacing one (PUT) are multipart uploads that cannot: the
  // Auggie panel uploads the PDF straight through this same reviewed endpoint —
  // the existing upload path, not a new one — and the draft it creates or the
  // file it replaces is then managed by propose_download_update.
  "downloads.ts": [
    "propose_download_update",
    "propose_download_retire",
    "panel-upload: propose_download_update",
    "panel-upload: propose_download_update",
  ],
  "newsletters/test.ts": "propose_newsletter_test_send",
  "students/[id]/hours-requests.ts": "propose_hours_request_decision",

  // Known gaps — should be reachable from the chat, not built yet.
  "diagnostics.ts": "gap: site health check is not yet a tool",
  "students/upload.ts": "gap: student photo upload (stage 4)",
  "students/[id]/application.ts": "gap: admin exam application is not yet a tool",
  "students/[id]/share.ts": "gap: student share links are not yet a tool",
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
        if (
          name === "page-only" ||
          name.startsWith("gap:") ||
          name.startsWith("panel-upload:")
        )
          continue;
        expect(toolNames.has(name), `${path} -> ${name}`).toBe(true);
      }
    }
  });

  it("wires each panel-upload endpoint to a real, permitted attachment tool", () => {
    const toolNames = new Set(
      adminAuggieToolCatalogue("renshinkan_super_admin").map(
        (entry) => entry.function.name,
      ),
    );
    const panelUploads = Object.entries(COVERAGE).filter(([, value]) =>
      (Array.isArray(value) ? value : [value]).some((name) =>
        name.startsWith("panel-upload:"),
      ),
    );
    // The attach control uploads through three reviewed endpoints: a newsletter
    // cover (site-media), a gallery album photo (gallery-media), and a download
    // PDF added or replaced through the downloads endpoint itself. Each is a
    // conscious decision above; a fourth appearing here needs the same.
    expect(panelUploads.map(([path]) => path).sort()).toEqual([
      "downloads.ts",
      "gallery-media.ts",
      "site-media.ts",
    ]);
    for (const [path, value] of panelUploads) {
      for (const name of Array.isArray(value) ? value : [value]) {
        if (!name.startsWith("panel-upload:")) continue;
        const tool = name.slice("panel-upload:".length).trim();
        expect(toolNames.has(tool), `${path} -> ${tool}`).toBe(true);
      }
    }
  });
});
