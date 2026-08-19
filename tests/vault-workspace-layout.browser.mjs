import assert from "node:assert/strict";

async function readRect(locator) {
  return locator.evaluateAll((elements) => {
    const rect = elements[0]?.getBoundingClientRect();
    return rect
      ? { height: rect.height, width: rect.width, x: rect.x, y: rect.y }
      : null;
  });
}

async function runVaultWorkspaceLayoutRegression(tab) {
  await tab.playwright.getByRole("tab", { name: "Документ" }).click();
  const canvasBody = tab.playwright.locator(
    'section[aria-label="Рабочее полотно"] > div.row-start-3',
  );
  const documentPanes = tab.playwright.locator("section[data-workspace-dock-slot]");
  const previewToggle = tab.playwright.locator(
    'button[aria-label="Открыть просмотр Markdown"], button[aria-label="Открыть редактор Markdown"]',
  );

  const paneCount = await documentPanes.count();
  assert.ok(paneCount >= 1 && paneCount <= 4, `Ожидалось от одной до четырёх областей, получено ${paneCount}`);

  const [bodyRect, paneRects, previewRect] = await Promise.all([
    readRect(canvasBody),
    Promise.all(Array.from({ length: paneCount }, (_, index) => readRect(documentPanes.nth(index)))),
    readRect(previewToggle),
  ]);

  assert.ok(bodyRect && paneRects.every(Boolean), "Области документа должны быть видимыми");
  for (const paneRect of paneRects) {
    assert.ok(
      paneRect.x >= bodyRect.x - 1
        && paneRect.y >= bodyRect.y - 1
        && paneRect.x + paneRect.width <= bodyRect.x + bodyRect.width + 1
        && paneRect.y + paneRect.height <= bodyRect.y + bodyRect.height + 1,
      "Каждая область документа должна оставаться внутри рабочего полотна",
    );
  }
  if (paneCount === 1) {
    assert.ok(
      paneRects[0].width / bodyRect.width > 0.98,
      `Один документ должен занимать всю ширину полотна, сейчас ${Math.round((paneRects[0].width / bodyRect.width) * 100)}%`,
    );
  }

  const scrollbarWidths = await documentPanes.locator("div.auto-hide-scrollbar").evaluateAll((elements) => (
    elements.map((element) => getComputedStyle(element).scrollbarWidth)
  ));
  assert.ok(scrollbarWidths.length >= paneCount, "У каждой области должен быть собственный scroll-контейнер");
  assert.ok(scrollbarWidths.every((width) => width === "thin"), "Scrollbar документа должен использовать тонкий системный канал");

  if (previewRect) {
    assert.ok(
      previewRect.width <= 36,
      `Компактный переключатель просмотра должен быть икон-кнопкой не шире 36px, сейчас ${Math.round(previewRect.width)}px`,
    );
  }

  const separator = tab.playwright.locator(
    '[role="separator"][aria-label="Изменить размер панели Vault"]',
  );
  assert.equal(await separator.count(), 1, "У открытой панели Vault должен быть доступный ресайзер");

  const panel = tab.playwright.locator('aside[aria-label="Панель Vault"]');
  const panelBefore = await readRect(panel);
  assert.ok(panelBefore, "Панель Vault должна быть видимой");

  const separatorRect = await readRect(separator);
  assert.ok(separatorRect, "Ресайзер панели Vault должен быть видимым");
  await tab.cua.click({
    x: separatorRect.x + separatorRect.width / 2,
    y: separatorRect.y + Math.min(separatorRect.height / 2, 120),
  });
  const position = await panel.getAttribute("data-panel-position");
  const growKey = position === "left"
    ? "ARROWRIGHT"
    : position === "right"
      ? "ARROWLEFT"
      : position === "top"
        ? "ARROWDOWN"
        : "ARROWUP";
  await tab.cua.keypress({ keys: [growKey] });
  await tab.playwright.waitForTimeout(240);

  const panelAfter = await readRect(panel);
  assert.ok(panelAfter, "Панель Vault должна оставаться видимой после ресайза");
  const beforeSize = position === "left" || position === "right" ? panelBefore.width : panelBefore.height;
  const afterSize = position === "left" || position === "right" ? panelAfter.width : panelAfter.height;
  assert.ok(afterSize > beforeSize, "Стрелка в сторону полотна должна увеличивать панель Vault");

  const shrinkKey = position === "left"
    ? "ARROWLEFT"
    : position === "right"
      ? "ARROWRIGHT"
      : position === "top"
        ? "ARROWUP"
        : "ARROWDOWN";
  await tab.cua.keypress({ keys: [shrinkKey] });
  await tab.playwright.waitForTimeout(240);

  return {
    compactPreviewWidth: previewRect?.width ?? null,
    paneCount,
    panelSizeBefore: beforeSize,
    panelSizeAfter: afterSize,
    position,
  };
}

export { runVaultWorkspaceLayoutRegression };
