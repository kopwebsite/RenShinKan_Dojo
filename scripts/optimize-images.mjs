import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const sourceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const preferredSourceExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const optimizerVersion = 2;
const avifOptions = { quality: 64, effort: 3 };
const webpOptions = { quality: 86, effort: 4, smartSubsample: true };
const optimizeConcurrency = Math.max(1, Number(process.env.IMAGE_OPTIMIZE_CONCURRENCY) || 2);

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
  {
    source: path.join(publicDir, "renshinkan-gallery"),
    output: path.join(publicDir, "optimized", "renshinkan-gallery"),
    label: "renshinkan-gallery",
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

function selectSourceFiles(files) {
  const selectedByBase = new Map();

  for (const file of files) {
    const parsed = path.parse(file);
    const extension = parsed.ext.toLowerCase();
    const preference = preferredSourceExtensions.indexOf(extension);
    const key = path.join(parsed.dir, parsed.name).toLowerCase();
    const current = selectedByBase.get(key);

    if (!current || preference < current.preference) {
      selectedByBase.set(key, { file, preference });
    }
  }

  return [...selectedByBase.values()].map((entry) => entry.file);
}

function outputBaseFor(sourcePath, root) {
  const relativePath = path.relative(root.source, sourcePath);
  const parsed = path.parse(relativePath);

  return path.join(root.output, parsed.dir, parsed.name);
}

function maxWidthFor(sourcePath) {
  const lower = sourcePath.toLowerCase();

  if (lower.includes("renshinkan-gallery")) {
    return 1920;
  }

  if (
    lower.includes("hero") ||
    lower.includes("poster") ||
    lower.includes("large") ||
    lower.includes("wide")
  ) {
    return 2048;
  }

  return 1600;
}

async function isFresh(outputPaths, metadataPath, sourceStat, settings) {
  const outputsExist = await Promise.all(outputPaths.map((outputPath) => pathExists(outputPath)));

  if (outputsExist.some((exists) => !exists) || !(await pathExists(metadataPath))) {
    return false;
  }

  const outputStats = await Promise.all(outputPaths.map((outputPath) => fs.stat(outputPath)));

  if (outputStats.some((outputStat) => outputStat.mtimeMs < sourceStat.mtimeMs)) {
    return false;
  }

  try {
    const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
    return (
      metadata.sourceBytes === sourceStat.size &&
      metadata.sourceMtimeMs === sourceStat.mtimeMs &&
      JSON.stringify(metadata.settings) === JSON.stringify(settings)
    );
  } catch {
    return false;
  }
}

async function optimizeOne(sourcePath, root) {
  const sourceStat = await fs.stat(sourcePath);
  const outputBase = outputBaseFor(sourcePath, root);
  const avifPath = `${outputBase}.avif`;
  const webpPath = `${outputBase}.webp`;
  const metadataPath = `${outputBase}.meta.json`;
  const outputDir = path.dirname(outputBase);
  const maxWidth = maxWidthFor(sourcePath);
  const settings = {
    optimizerVersion,
    maxWidth,
    avif: avifOptions,
    webp: webpOptions,
  };

  if (await isFresh([avifPath, webpPath], metadataPath, sourceStat, settings)) {
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
    pipeline.clone().avif(avifOptions).toBuffer(),
    pipeline.clone().webp(webpOptions).toBuffer(),
  ]);

  await Promise.all([
    fs.writeFile(avifPath, avifBuffer),
    fs.writeFile(webpPath, webpBuffer),
    fs.writeFile(
      metadataPath,
      `${JSON.stringify(
        {
          sourceBytes: sourceStat.size,
          sourceMtimeMs: sourceStat.mtimeMs,
          settings,
        },
        null,
        2,
      )}\n`,
    ),
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

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

async function main() {
  const results = [];

  for (const root of scanRoots) {
    const files = selectSourceFiles(await walkFiles(root.source));
    const optimizedFiles = await mapWithConcurrency(
      files,
      optimizeConcurrency,
      (file) => optimizeOne(file, root),
    );
    results.push(...optimizedFiles);
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
