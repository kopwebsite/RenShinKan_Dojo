import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputPath = resolve(
  process.argv.find((argument) => argument.startsWith("--input="))?.slice(8) ||
    ".perf/fixtures/performance-content.json",
);
const outputPath = resolve(
  process.argv.find((argument) => argument.startsWith("--output="))?.slice(9) ||
    ".perf/preview-content.json",
);
const source = JSON.parse(readFileSync(inputPath, "utf8"));
const galleryAlbums = Object.fromEntries(
  Object.entries(source.galleryAlbums || {}).map(([section, albums]) => [
    section,
    Array.isArray(albums)
      ? albums.slice(0, 4).map((album) => ({
          ...album,
          photos: Array.isArray(album.photos) ? album.photos.slice(0, 8) : [],
        }))
      : [],
  ]),
);
const content = {
  ...source,
  recentEvents: Array.isArray(source.recentEvents)
    ? source.recentEvents.slice(0, 50)
    : [],
  galleryAlbums,
};

if (
  !content.recentEvents.some(
    (event) => event.slug === "capacity-newsletter-0050",
  )
) {
  throw new Error(
    "Preview content does not include the required article fixture",
  );
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(content)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
process.stdout.write(
  `${JSON.stringify({
    outputPath,
    newsletters: content.recentEvents.length,
    galleryAlbums: Object.values(galleryAlbums).reduce(
      (total, albums) => total + albums.length,
      0,
    ),
    galleryPhotos: Object.values(galleryAlbums).reduce(
      (total, albums) =>
        total +
        albums.reduce(
          (albumTotal, album) => albumTotal + album.photos.length,
          0,
        ),
      0,
    ),
    sanitized: true,
  })}\n`,
);
