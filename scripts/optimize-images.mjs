import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const sourceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const scanRoots = [
  {
    source: path.join(publicDir, "uploads", "originals"),
    output: path.join(publicDir, "uploads", "generated"),
    label: "uploads",
  },
  {
    source: path.join(publicDir, "dojo-photos"),
    output: path.join(publicDir, "optimized", "dojo-photos"),
    label: "dojo-photos",
  },
  {
    source: path.join(publicDir, "past-events"),
    output: path.join(publicDir, "optimized", "past-events"),
    label: "past-events",
  },
];

const formatBytes = (bytes) => {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  if (!await pathExists(dir)) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function outputBaseFor(sourcePath, root) {
  const relativePath = path.relative(root.source, sourcePath);
  const parsed = path.parse(relativePath);

  return path.join(root.output, parsed.dir, parsed.name);
}

function maxWidthFor(sourcePath) {
  const lower = sourcePath.toLowerCase();

  if (
    lower.includes("hero") ||
    lower.includes("poster") ||
    lower.includes("large") ||
    lower.includes("wide")
  ) {
    return 1920;
  }

  return 1600;
}

async function isFresh(outputPath, sourceStat) {
  if (!await pathExists(outputPath)) {
    return false;
  }

  const outputStat = await fs.stat(outputPath);
  return outputStat.mtimeMs >= sourceStat.mtimeMs;
}

async function optimizeOne(sourcePath, root) {
  const sourceStat = await fs.stat(sourcePath);
  const outputBase = outputBaseFor(sourcePath, root);
  const avifPath = `${outputBase}.avif`;
  const webpPath = `${outputBase}.webp`;
  const outputDir = path.dirname(outputBase);
  const maxWidth = maxWidthFor(sourcePath);
  const [avifFresh, webpFresh] = await Promise.all([
    isFresh(avifPath, sourceStat),
    isFresh(webpPath, sourceStat),
  ]);

  if (avifFresh && webpFresh) {
    const [avifStat, webpStat] = await Promise.all([fs.stat(avifPath), fs.stat(webpPath)]);
    return {
      sourcePath,
      avifPath,
      webpPath,
      sourceBytes: sourceStat.size,
      generatedBytes: avifStat.size + webpStat.size,
      status: "cached",
      maxWidth,
    };
  }

  await fs.mkdir(outputDir, { recursive: true });

  const pipeline = sharp(sourcePath)
    .rotate()
    .resize({
      width: maxWidth,
      withoutEnlargement: true,
    });
  const [avifBuffer, webpBuffer] = await Promise.all([
    pipeline.clone().avif({ quality: 50, effort: 5 }).toBuffer(),
    pipeline.clone().webp({ quality: 78, effort: 4 }).toBuffer(),
  ]);

  await Promise.all([
    fs.writeFile(avifPath, avifBuffer),
    fs.writeFile(webpPath, webpBuffer),
  ]);

  return {
    sourcePath,
    avifPath,
    webpPath,
    sourceBytes: sourceStat.size,
    generatedBytes: avifBuffer.length + webpBuffer.length,
    status: "generated",
    maxWidth,
  };
}

function publicPath(filePath) {
  return `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`;
}

async function main() {
  const results = [];

  for (const root of scanRoots) {
    const files = await walkFiles(root.source);

    for (const file of files) {
      results.push(await optimizeOne(file, root));
    }
  }

  const generated = results.filter((result) => result.status === "generated");
  const cached = results.filter((result) => result.status === "cached");
  const sourceBytes = results.reduce((sum, result) => sum + result.sourceBytes, 0);
  const generatedBytes = results.reduce((sum, result) => sum + result.generatedBytes, 0);

  console.log("Image optimization report");
  console.log("=========================");
  console.log(`Sources scanned: ${results.length}`);
  console.log(`Generated: ${generated.length}`);
  console.log(`Cached: ${cached.length}`);
  console.log(`Source bytes: ${formatBytes(sourceBytes)}`);
  console.log(`Generated AVIF+WebP bytes: ${formatBytes(generatedBytes)}`);
  console.log("");

  generated
    .sort((a, b) => b.sourceBytes - a.sourceBytes)
    .slice(0, 25)
    .forEach((result) => {
      console.log(
        `- ${publicPath(result.sourcePath)} -> ${publicPath(result.avifPath)}, ${publicPath(result.webpPath)} (${formatBytes(result.sourceBytes)} source, max ${result.maxWidth}px)`,
      );
    });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
