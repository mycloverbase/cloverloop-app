import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const publicImages = path.join(process.cwd(), "public", "images");
const folders = ["home", "features", "resources"];

for (const folder of folders) {
  const directory = path.join(publicImages, folder);
  const files = await readdir(directory);
  for (const file of files.filter((name) => name.endsWith(".png"))) {
    const source = path.join(directory, file);
    if (folder === "features" && file === "feature-illustration-set.png") {
      await unlink(source);
      console.log("Excluded a feature illustration containing a legacy URL and unsupported payment UI.");
      continue;
    }
    const destination = path.join(directory, `${path.parse(file).name}.webp`);
    let pipeline = sharp(source);

    if (folder === "home" && file === "hero.png") {
      const domainOverlay = Buffer.from(
        `<svg width="1376" height="768" xmlns="http://www.w3.org/2000/svg"><rect x="664" y="106" width="190" height="22" rx="4" fill="#eef0ed"/><text x="682" y="121" font-family="Arial, sans-serif" font-size="11" fill="#343a36">cloverloop.in/creator-store</text></svg>`,
      );
      pipeline = pipeline.composite([{ input: domainOverlay }]);
    }

    await pipeline.webp({ quality: 84, alphaQuality: 90, effort: 5 }).toFile(destination);
    await unlink(source);
  }
}

const faviconSource = path.join(publicImages, "brand", "favicon.png");
const icon = await sharp(faviconSource)
  .extract({ left: 304, top: 0, width: 768, height: 768 })
  .resize(256, 256)
  .png()
  .toBuffer();
await sharp(icon).toFile(path.join(process.cwd(), "public", "favicon.png"));
await sharp(icon).resize(180, 180).toFile(path.join(process.cwd(), "public", "apple-touch-icon.png"));

console.log("Optimized supplied raster illustrations to responsive WebP assets.");
