import { describe, expect, it } from "vitest";
import {
  adminAuggieToolCatalogue,
  offeredToolNames,
  relevantToolNames,
  routeToolArea,
  TOOL_AREAS,
  type ToolArea,
} from "../functions/_lib/adminAuggie";

// Admin Auggie now chooses a tool in two steps: the server routes each message
// to one area of the administration section, then the model is shown only that
// area's actions. This test is the executable measurement and the accuracy
// guard for that routing. It prints the tools-per-message and prompt-size
// numbers for three strategies so the win is visible, and it fails if the
// two-step routing ever stops offering the right tool for a representative
// message — that is what keeps accuracy from quietly regressing as more tools
// are added.
//
// Latency is not measured here: it needs the live Cloudflare Workers AI binding
// (env.AI), which the test harness cannot reach. The numbers below are the
// tool count and the exact bytes of the tool schemas sent on each message,
// which is the part of the prompt that actually grows with the catalogue.

const PERMISSION = "renshinkan_super_admin";

// A neutral page, so routing is judged from the message text alone. It matches
// no tool's topic path, which is the hardest case; on a real page the current
// path only ever adds signal.
const NEUTRAL_PATH = "/admin/reports";

// One representative message per common request, in English and Thai, with the
// tool the administrator is really asking for. The two-step routing must offer
// that tool. These mirror the examples the panel itself suggests plus one write
// per area.
const CASES: Array<{ message: string; expect: string; note: string }> = [
  // Reading / system / conversation.
  { message: "Show me the dashboard summary", expect: "get_dashboard_summary", note: "dashboard" },
  { message: "Is the website healthy right now?", expect: "get_site_health", note: "site health" },
  { message: "What is the weather in Chiang Mai right now?", expect: "look_up_information", note: "weather" },
  { message: "hello there", expect: "converse", note: "greeting" },
  // Students.
  { message: "Find Student ID RSK-1001", expect: "search_students", note: "find student" },
  { message: "List pending profile requests and their dojos", expect: "list_profile_requests", note: "profile requests" },
  { message: "Who changed RSK-1001 and when?", expect: "read_student_history", note: "history" },
  { message: "Archive RSK-1001", expect: "propose_student_status", note: "archive" },
  { message: "Add 3 training hours to RSK-1001", expect: "propose_student_hours", note: "hours" },
  { message: "Record an examination result for RSK-1001", expect: "propose_student_examination", note: "exam result (crosses examinations)" },
  { message: "Approve the profile picture request", expect: "propose_student_profile_decision", note: "profile decision" },
  { message: "Start a new student profile", expect: "start_guided_flow", note: "guided create" },
  // Examinations.
  { message: "Who signed up for the exam and has not paid?", expect: "list_examination_applications", note: "exam applications" },
  // Payments.
  { message: "How many paid the monthly contribution in 2026-07?", expect: "get_contribution_summary", note: "contributions" },
  { message: "Show the pending payment proofs", expect: "list_payment_proofs", note: "payment proofs" },
  // Website / newsletters.
  { message: "List the newsletters", expect: "list_newsletters", note: "newsletters" },
  { message: "Send the newsletter to subscribers", expect: "propose_newsletter_send", note: "newsletter send" },
  { message: "Publish the website", expect: "propose_site_publish", note: "site publish" },
  // Galleries.
  { message: "Show the gallery albums", expect: "list_gallery_albums", note: "gallery albums" },
  { message: "Update the album cover photo", expect: "propose_gallery_album_update", note: "album update" },
  // Dojos.
  { message: "List the dojos", expect: "list_dojos", note: "dojos" },
  { message: "Change the dojo short name", expect: "propose_dojo_settings", note: "dojo settings" },
  // Thai — the same administrator working in Thai must get the same routing.
  { message: "ค้นหารหัสนักเรียน RSK-1001", expect: "search_students", note: "TH find student" },
  { message: "เดือน 2026-07 มีใครชำระเงินสมทบบ้าง", expect: "get_contribution_summary", note: "TH contributions" },
  { message: "เริ่มสร้างประวัตินักเรียนใหม่", expect: "start_guided_flow", note: "TH guided create" },
  { message: "อากาศที่เชียงใหม่ตอนนี้เป็นอย่างไร", expect: "look_up_information", note: "TH weather" },
  { message: "ขอสรุปแดชบอร์ด", expect: "get_dashboard_summary", note: "TH dashboard" },
];

const catalogue = adminAuggieToolCatalogue(PERMISSION);
const available = catalogue.map((entry) => entry.function.name);
const byName = new Map(catalogue.map((entry) => [entry.function.name, entry]));

// The exact bytes of the tool schemas offered, which is what a shortlist saves
// off the prompt sent to the model on every single message.
function bytesOf(names: readonly string[]) {
  return JSON.stringify(names.map((name) => byName.get(name))).length;
}

function measure(names: readonly string[]) {
  return { tools: names.length, bytes: bytesOf(names) };
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

describe("Admin Auggie two-step tool routing — measurement", () => {
  it("prints tools-per-message and prompt-size, before (flat) vs after (area)", () => {
    const whole = measure(available);
    const rows = CASES.map((testCase) => {
      const input = {
        available,
        message: testCase.message,
        currentPath: NEUTRAL_PATH,
      };
      const flat = measure(relevantToolNames(input));
      const area = measure(offeredToolNames(input));
      const flatHit = relevantToolNames(input).includes(testCase.expect);
      const areaHit = offeredToolNames(input).includes(testCase.expect);
      return { ...testCase, flat, area, flatHit, areaHit };
    });

    const flatTools = average(rows.map((row) => row.flat.tools));
    const areaTools = average(rows.map((row) => row.area.tools));
    const flatBytes = average(rows.map((row) => row.flat.bytes));
    const areaBytes = average(rows.map((row) => row.area.bytes));
    const areaMaxTools = Math.max(...rows.map((row) => row.area.tools));
    const flatAccuracy = rows.filter((row) => row.flatHit).length;
    const areaAccuracy = rows.filter((row) => row.areaHit).length;

    const lines: string[] = [];
    lines.push("");
    lines.push("Admin Auggie tool selection — measured over " + rows.length + " representative messages");
    lines.push("(neutral page " + NEUTRAL_PATH + "; latency needs live env.AI and is not measured here)");
    lines.push("");
    lines.push("  strategy               avg tools   avg bytes   correct-tool offered");
    lines.push(
      "  whole catalogue          " +
        String(whole.tools).padStart(3) +
        "        " +
        String(whole.bytes).padStart(5) +
        "       (everything, always)",
    );
    lines.push(
      "  flat shortlist (before)  " +
        String(flatTools).padStart(3) +
        "        " +
        String(flatBytes).padStart(5) +
        "       " +
        flatAccuracy +
        "/" +
        rows.length,
    );
    lines.push(
      "  area routing (after)     " +
        String(areaTools).padStart(3) +
        "        " +
        String(areaBytes).padStart(5) +
        "       " +
        areaAccuracy +
        "/" +
        rows.length +
        "   (max " +
        areaMaxTools +
        " tools/msg)",
    );
    lines.push("");
    lines.push("  per message (tools / bytes): area vs flat");
    for (const row of rows) {
      lines.push(
        "    " +
          (row.areaHit ? "ok " : "MISS ") +
          row.note.padEnd(34) +
          " area " +
          String(row.area.tools).padStart(2) +
          "/" +
          String(row.area.bytes).padStart(4) +
          "   flat " +
          String(row.flat.tools).padStart(2) +
          "/" +
          String(row.flat.bytes).padStart(4),
      );
    }
    lines.push("");
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));

    // The whole point: each message now sees a small, related slice of the
    // catalogue instead of everything.
    expect(areaTools).toBeLessThan(whole.tools);
    expect(areaBytes).toBeLessThan(whole.bytes);
    // And it stays bounded no matter how the catalogue grows.
    expect(areaMaxTools).toBeLessThanOrEqual(12);
  });

  it("offers the correct tool for every representative message (accuracy guard)", () => {
    for (const testCase of CASES) {
      expect(available, testCase.message).toContain(testCase.expect);
      const offered = offeredToolNames({
        available,
        message: testCase.message,
        currentPath: NEUTRAL_PATH,
      });
      // If this fails, area routing stopped offering the tool this message is
      // really about — accuracy has regressed. Fix the routing, do not loosen
      // this expectation.
      expect(offered, `${testCase.message} -> ${testCase.expect}`).toContain(
        testCase.expect,
      );
      expect(offered.length, testCase.message).toBeLessThanOrEqual(12);
    }
  });

  it("routes a message to exactly one area, or two only on a genuine dead-heat", () => {
    for (const testCase of CASES) {
      const areas = routeToolArea({
        available,
        message: testCase.message,
        currentPath: NEUTRAL_PATH,
      });
      expect(areas.length, testCase.message).toBeLessThanOrEqual(2);
    }
  });
});

describe("Admin Auggie tool-area map — rot guard", () => {
  it("places every catalogue tool in exactly one area", () => {
    const placement = new Map<string, ToolArea[]>();
    for (const area of Object.keys(TOOL_AREAS) as ToolArea[])
      for (const name of TOOL_AREAS[area])
        placement.set(name, [...(placement.get(name) ?? []), area]);

    // Every tool the model can be offered must have an area, so a new tool
    // cannot ship without a conscious decision about where it routes.
    const unplaced = available.filter((name) => !placement.has(name));
    expect(unplaced, "catalogue tools missing from TOOL_AREAS").toEqual([]);

    // And no tool sits in two areas, which would make routing ambiguous.
    const doublePlaced = [...placement.entries()]
      .filter(([, areas]) => areas.length > 1)
      .map(([name]) => name);
    expect(doublePlaced, "tools placed in more than one area").toEqual([]);
  });

  it("has no stale area entries pointing at tools that no longer exist", () => {
    const known = new Set(available);
    const stale = (Object.keys(TOOL_AREAS) as ToolArea[]).flatMap((area) =>
      TOOL_AREAS[area].filter((name) => !known.has(name)),
    );
    expect(stale, "TOOL_AREAS names with no matching tool").toEqual([]);
  });
});
