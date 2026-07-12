import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const generatedMetadataPath = path.join(rootDir, "src", "data", "imageMetadata.generated.ts");
const generatedInventoryPath = path.join(rootDir, "IMAGE_INVENTORY.md");
const sourceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const preferredSourceExtensions = [".png", ".jpg", ".jpeg", ".webp"];
const responsiveWidths = [640, 1280, 1920];
const optimizerVersion = 3;
const avifOptions = { quality: 62, effort: 3 };
const webpOptions = { quality: 82, effort: 4, smartSubsample: true };
const optimizeConcurrency = Math.max(1, Number(process.env.IMAGE_OPTIMIZE_CONCURRENCY) || 2);

const directoryRoots = [
  "backgrounds",
  "dojo-photos",
  "past-events",
  "renshinkan-gallery",
  "renshinkan-build",
  "instructors",
  "history",
  "cmu",
  "pcf-aikido",
  "peace-culture",
  "community",
].map((directory) => ({
  source: path.join(publicDir, directory),
  output: path.join(publicDir, "optimized", directory),
  label: directory,
}));

const scanRoots = [
  {
    source: path.join(publicDir, "uploads", "originals"),
    output: path.join(publicDir, "uploads", "generated"),
    label: "uploads",
  },
  ...directoryRoots,
  {
    source: publicDir,
    output: path.join(publicDir, "optimized", "brand"),
    label: "brand",
    files: [path.join(publicDir, "renshinkan-logo.png")],
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
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();

    // Windows can expose cloud-synced/reparse-point assets as symbolic links.
    // Follow those entries so local builds scan the same source set as CI.
    if (entry.isSymbolicLink()) {
      try {
        const stats = await fs.stat(fullPath);
        isDirectory = stats.isDirectory();
        isFile = stats.isFile();
      } catch {
        continue;
      }
    }

    if (isDirectory) {
      files.push(...await walkFiles(fullPath));
      continue;
    }

    if (isFile && sourceExtensions.has(path.extname(entry.name).toLowerCase())) {
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

function maxWidthFor(sourcePath, root) {
  const lower = sourcePath.toLowerCase();

  if (root.label === "brand") {
    return 384;
  }

  if (lower.includes("backgrounds")) {
    return lower.includes("mobile") ? 900 : 1920;
  }

  if (
    lower.includes("hero") ||
    lower.includes("poster") ||
    lower.includes("large") ||
    lower.includes("wide") ||
    lower.includes("renshinkan-gallery")
  ) {
    return 1920;
  }

  return 1600;
}

function orientedDimensions(metadata) {
  const shouldSwap = [5, 6, 7, 8].includes(metadata.orientation);
  const width = shouldSwap ? metadata.height : metadata.width;
  const height = shouldSwap ? metadata.width : metadata.height;

  if (!width || !height) {
    throw new Error("Image dimensions could not be read");
  }

  return { width, height };
}

function outputPathForWidth(outputBase, width, outputWidth, extension) {
  const suffix = width === outputWidth ? "" : `-${width}`;
  return `${outputBase}${suffix}.${extension}`;
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
  const sourceMetadata = await sharp(sourcePath).metadata();
  const sourceDimensions = orientedDimensions(sourceMetadata);
  const outputBase = outputBaseFor(sourcePath, root);
  const metadataPath = `${outputBase}.meta.json`;
  const outputDir = path.dirname(outputBase);
  const outputWidth = Math.min(sourceDimensions.width, maxWidthFor(sourcePath, root));
  const outputHeight = Math.round(sourceDimensions.height * (outputWidth / sourceDimensions.width));
  const widths = [...new Set([
    ...responsiveWidths.filter((width) => width < outputWidth),
    outputWidth,
  ])].sort((a, b) => a - b);
  const outputPaths = widths.flatMap((width) => [
    outputPathForWidth(outputBase, width, outputWidth, "avif"),
    outputPathForWidth(outputBase, width, outputWidth, "webp"),
  ]);
  const settings = {
    optimizerVersion,
    outputWidth,
    outputHeight,
    widths,
    avif: avifOptions,
    webp: webpOptions,
  };

  const resultBase = {
    sourcePath,
    sourceBytes: sourceStat.size,
    outputBase,
    outputWidth,
    outputHeight,
    widths,
  };

  if (await isFresh(outputPaths, metadataPath, sourceStat, settings)) {
    const outputStats = await Promise.all(outputPaths.map((outputPath) => fs.stat(outputPath)));
    return {
      ...resultBase,
      generatedBytes: outputStats.reduce((sum, outputStat) => sum + outputStat.size, 0),
      status: "cached",
    };
  }

  await fs.mkdir(outputDir, { recursive: true });

  const pipeline = sharp(sourcePath).rotate();
  let generatedBytes = 0;

  for (const width of widths) {
    const resized = pipeline.clone().resize({ width, withoutEnlargement: true });
    const [avifBuffer, webpBuffer] = await Promise.all([
      resized.clone().avif(avifOptions).toBuffer(),
      resized.clone().webp(webpOptions).toBuffer(),
    ]);
    const avifPath = outputPathForWidth(outputBase, width, outputWidth, "avif");
    const webpPath = outputPathForWidth(outputBase, width, outputWidth, "webp");

    await Promise.all([
      fs.writeFile(avifPath, avifBuffer),
      fs.writeFile(webpPath, webpBuffer),
    ]);
    generatedBytes += avifBuffer.length + webpBuffer.length;
  }

  await fs.writeFile(
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
  );

  return {
    ...resultBase,
    generatedBytes,
    status: "generated",
  };
}

function publicPath(filePath) {
  return `/${path.relative(publicDir, filePath).split(path.sep).join("/")}`;
}

function sourceKey(sourcePath) {
  const relativePath = path.relative(publicDir, sourcePath).split(path.sep).join("/");
  return `/${relativePath.replace(/\.(png|jpe?g|webp)$/i, "")}`;
}

async function writeImageMetadata(results) {
  const entries = results
    .map((result) => [
      sourceKey(result.sourcePath),
      [result.outputWidth, result.outputHeight, result.widths],
    ])
    .sort(([left], [right]) => left.localeCompare(right));
  const metadata = Object.fromEntries(entries);
  const generated = `// Generated by scripts/optimize-images.mjs. Do not edit by hand.\n` +
    `export const imageMetadata = ${JSON.stringify(metadata, null, 2)} as const;\n` +
    `\nexport type ImageMetadataKey = keyof typeof imageMetadata;\n`;

  await fs.writeFile(generatedMetadataPath, generated);
}

async function writeImageInventory(results) {
  const staticAssets = [
    path.join(publicDir, "favicon.png"),
    path.join(publicDir, "images", "promptpay-qr.png"),
  ];
  const staticRows = [];

  for (const asset of staticAssets) {
    if (!await pathExists(asset)) {
      continue;
    }

    const metadata = orientedDimensions(await sharp(asset).metadata());
    staticRows.push(
      `| \`${publicPath(asset)}\` | ${metadata.width}×${metadata.height} | Original format retained |`,
    );
  }

  const optimizedRows = results
    .slice()
    .sort((left, right) => publicPath(left.sourcePath).localeCompare(publicPath(right.sourcePath)))
    .map((result) => (
      `| \`${publicPath(result.sourcePath)}\` | ${result.outputWidth}×${result.outputHeight} | ${result.widths.join(", ")} |`
    ));
  const inventory = `# Image inventory\n\n` +
    `Generated by \`npm run optimize:images\`. The table is exhaustive for the static image roots used by the public site. Runtime admin uploads are listed by the content API and retain their stored dimensions.\n\n` +
    `## Route coverage\n\n` +
    `- Homepage: \`/backgrounds\`, \`/renshinkan-logo.png\`, \`/dojo-photos\`, \`/instructors\`, \`/renshinkan-build\`, and \`/renshinkan-gallery/group-photos\`.\n` +
    `- Aikido: \`/dojo-photos/aikido-*\`, \`/history\`, and instructor portraits.\n` +
    `- Classes: schedule, children, grading, and \`/renshinkan-gallery/belt-ceremony\` images.\n` +
    `- Community: \`/pcf-aikido\`, \`/peace-culture\`, \`/cmu\`, \`/community\`, and the history gallery.\n` +
    `- Support: community/support artwork and the PromptPay QR image.\n` +
    `- Newsletter/events: \`/past-events\` plus content-managed uploads.\n\n` +
    `## Responsive AVIF/WebP sources\n\n` +
    `| Source | Intrinsic optimized size | Generated widths |\n` +
    `| --- | ---: | --- |\n` +
    `${optimizedRows.join("\n")}\n\n` +
    `## Static originals intentionally retained\n\n` +
    `| Source | Dimensions | Reason |\n` +
    `| --- | ---: | --- |\n` +
    `${staticRows.join("\n")}\n`;

  await fs.writeFile(generatedInventoryPath, inventory);
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
    const files = selectSourceFiles(root.files ?? await walkFiles(root.source));
    const optimizedFiles = await mapWithConcurrency(
      files,
      optimizeConcurrency,
      (file) => optimizeOne(file, root),
    );
    results.push(...optimizedFiles);
  }

  await writeImageMetadata(results);
  await writeImageInventory(results);

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
  console.log(`Responsive AVIF+WebP bytes: ${formatBytes(generatedBytes)}`);
  console.log("");

  generated
    .sort((a, b) => b.sourceBytes - a.sourceBytes)
    .slice(0, 25)
    .forEach((result) => {
      console.log(
        `- ${publicPath(result.sourcePath)} -> ${publicPath(result.outputBase)}-{${result.widths.join(",")}}.avif/webp (${formatBytes(result.sourceBytes)} source)`,
      );
    });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
