import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
const indexPath = join(distDir, "index.html");
const fallbackPath = join(distDir, "404.html");

if (existsSync(indexPath)) {
  copyFileSync(indexPath, fallbackPath);
}
