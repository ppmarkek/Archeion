import sharp from "sharp";

async function readCrop(path, crop) {
  return sharp(path).extract(crop).raw().toBuffer({ resolveWithObject: true });
}

async function main() {
  const [mode, firstPath, secondOrCrop, maybeCrop] = process.argv.slice(2);

  if (mode === "analyze") {
    const crop = JSON.parse(secondOrCrop);
    const { data, info } = await readCrop(firstPath, crop);
    let brightPixels = 0;

    for (let offset = 0; offset < data.length; offset += info.channels) {
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) >= 60) brightPixels += 1;
    }

    process.stdout.write(JSON.stringify({
      brightPixels,
      totalPixels: info.width * info.height,
    }));
    return;
  }

  if (mode === "compare") {
    const crop = JSON.parse(maybeCrop);
    const first = await readCrop(firstPath, crop);
    const second = await readCrop(secondOrCrop, crop);

    if (first.data.length !== second.data.length) throw new Error("Размеры кадров Атласа не совпадают");

    let changedPixels = 0;
    for (let offset = 0; offset < first.data.length; offset += first.info.channels) {
      const largestDifference = Math.max(
        Math.abs(first.data[offset] - second.data[offset]),
        Math.abs(first.data[offset + 1] - second.data[offset + 1]),
        Math.abs(first.data[offset + 2] - second.data[offset + 2]),
      );
      if (largestDifference > 2) changedPixels += 1;
    }

    process.stdout.write(JSON.stringify({
      changedPixels,
      differenceRatio: changedPixels / (first.info.width * first.info.height),
    }));
    return;
  }

  throw new Error(`Неизвестный режим анализа: ${mode}`);
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
