import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const analyzerPath = fileURLToPath(new URL("./atlas-frame-analyzer.mjs", import.meta.url));
const framePaths = [
  "/private/tmp/archeion-atlas-fit.png",
  "/private/tmp/archeion-atlas-before-pan.png",
  "/private/tmp/archeion-atlas-after-pan.png",
  "/private/tmp/archeion-atlas-before-node-drag.png",
  "/private/tmp/archeion-atlas-after-node-drag.png",
];

async function analyzeFrame(path, crop) {
  const { stdout } = await execFileAsync("node", [analyzerPath, "analyze", path, JSON.stringify(crop)]);
  return JSON.parse(stdout);
}

async function compareFrames(firstPath, secondPath, crop) {
  const { stdout } = await execFileAsync("node", [analyzerPath, "compare", firstPath, secondPath, JSON.stringify(crop)]);
  return JSON.parse(stdout);
}

async function runAtlasInteractionRegression(tab) {
  const atlasTab = tab.playwright.getByRole("tab", { name: "Атлас" });
  await atlasTab.click();

  const canvas = tab.playwright.locator('canvas[aria-label^="Граф знаний"]');
  await canvas.waitFor({ state: "visible", timeoutMs: 5_000 });
  await tab.playwright.waitForTimeout(1_200);
  await tab.playwright.getByRole("button", { name: "Показать весь граф" }).click();
  await tab.playwright.waitForTimeout(350);

  const canvasRect = await canvas.evaluateAll((elements) => {
    const rect = elements[0]?.getBoundingClientRect();
    return rect ? {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    } : null;
  });
  assert.ok(canvasRect, "Canvas Атласа должен иметь видимую геометрию");

  const crop = {
    height: Math.max(120, Math.floor(canvasRect.height - 220)),
    left: Math.floor(canvasRect.left + Math.min(300, canvasRect.width * 0.3)),
    top: Math.floor(canvasRect.top + 130),
    width: Math.max(160, Math.floor(canvasRect.width - Math.min(300, canvasRect.width * 0.3) - 90)),
  };

  try {
    await writeFile(framePaths[0], await tab.screenshot());
    const fittedFrame = await analyzeFrame(framePaths[0], crop);
    assert.ok(
      fittedFrame.brightPixels >= 150,
      `Подгонка должна показать узлы в рабочей области, найдено ярких пикселей: ${fittedFrame.brightPixels}`,
    );

    await writeFile(framePaths[1], await tab.screenshot());
    const start = {
      x: Math.floor(canvasRect.right - 120),
      y: Math.floor(canvasRect.bottom - 140),
    };
    const finish = { x: start.x - 180, y: start.y };
    await tab.cua.drag({
      path: Array.from({ length: 7 }, (_, index) => ({
        x: start.x + ((finish.x - start.x) * index) / 6,
        y: start.y,
      })),
    });
    await tab.playwright.waitForTimeout(50);
    await writeFile(framePaths[2], await tab.screenshot());

    const panDifference = await compareFrames(framePaths[1], framePaths[2], crop);
    assert.ok(
      panDifference.differenceRatio >= 0.001,
      `Панорамирование должно изменить отрисовку графа, доля изменённых пикселей: ${panDifference.differenceRatio}`,
    );

    await tab.playwright.getByRole("button", { name: "Показать весь граф" }).click();
    await canvas.press("ArrowRight");
    const tooltip = tab.playwright.locator('section[aria-label="Атлас — граф знаний"] .pointer-events-none.absolute.z-30');
    await tooltip.waitFor({ state: "visible", timeoutMs: 2_000 });
    const nodePoint = await tooltip.evaluateAll((elements) => {
      const rect = elements[0]?.getBoundingClientRect();
      return rect ? { x: rect.left - 14, y: rect.top - 14 } : null;
    });
    assert.ok(nodePoint, "Клавиатурный фокус должен раскрыть координаты узла");

    await writeFile(framePaths[3], await tab.screenshot());
    await tab.cua.drag({
      path: Array.from({ length: 7 }, (_, index) => ({
        x: nodePoint.x + (120 * index) / 6,
        y: nodePoint.y,
      })),
    });
    await tab.playwright.waitForTimeout(50);
    await writeFile(framePaths[4], await tab.screenshot());
    const nodeDragDifference = await compareFrames(framePaths[3], framePaths[4], crop);
    assert.ok(
      nodeDragDifference.changedPixels >= 20,
      `Перетаскивание узла должно изменить его положение, изменено пикселей: ${nodeDragDifference.changedPixels}`,
    );

    return {
      brightPixelsAfterFit: fittedFrame.brightPixels,
      nodeDragChangedPixels: nodeDragDifference.changedPixels,
      panDifferenceRatio: panDifference.differenceRatio,
    };
  } finally {
    await Promise.all(framePaths.map((path) => unlink(path).catch(() => undefined)));
  }
}

export { runAtlasInteractionRegression };
