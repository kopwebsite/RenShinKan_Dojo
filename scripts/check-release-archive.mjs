import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbidden = tracked.filter(
  (path) =>
    path !== ".dev.vars.example" &&
    /(^|\/)(?:node_modules|dist|coverage|tmp|test-results|playwright-report|\.wrangler|local-uploads|uploads-temp|release-archives)(?:\/|$)|(?:^|\/)\.dev\.vars(?:\.|$)|(?:^|\/)\.env\.(?!example$)|\.(?:sqlite3?|db|pem|p12|pfx|key)$/i.test(
      path,
    ),
);
if (forbidden.length) {
  console.error(
    "Release archive would contain excluded local or credential-bearing paths:",
  );
  forbidden.forEach((path) => console.error(`- ${path}`));
  process.exit(1);
}
console.log(
  `Release archive manifest is clean (${tracked.length} tracked files checked).`,
);
