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
  const canvasBody = tab.playwright.locator(
    'section[aria-label="Рабочее полотно"] > div.row-start-3',
  );
  const documentPane = tab.playwright.locator("#workspace-pane-center");
  const documentScrollRegion = tab.playwright.locator(
    "#workspace-pane-center > div.overflow-y-auto",
  );
  const previewToggle = tab.playwright.locator(
    'button[aria-label="Открыть просмотр Markdown"], button[aria-label="Открыть редактор Markdown"]',
  );

  assert.equal(await documentPane.count(), 1, "Должна быть одна активная область документа");

  const [bodyRect, paneRect, previewRect] = await Promise.all([
    readRect(canvasBody),
    readRect(documentPane),
    readRect(previewToggle),
  ]);

  assert.ok(bodyRect && paneRect, "Область документа должна быть видимой");
  assert.ok(
    paneRect.width / bodyRect.width > 0.98,
    `Один документ должен занимать всю ширину полотна, сейчас ${Math.round((paneRect.width / bodyRect.width) * 100)}%`,
  );

  const scrollbar = await documentScrollRegion.evaluateAll((elements) => {
    const element = elements[0];
    const computed = getComputedStyle(element);
    return {
      overflow: element.scrollHeight - element.clientHeight,
      width: computed.scrollbarWidth,
    };
  });
  assert.ok(
    scrollbar.overflow <= 1,
    `Короткая заметка не должна показывать лишний scrollbar из-за ${scrollbar.overflow}px переполнения`,
  );
  assert.equal(scrollbar.width, "thin", "Scrollbar документа должен использовать тонкий системный канал");

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
    documentFill: paneRect.width / bodyRect.width,
    documentOverflow: scrollbar.overflow,
    panelSizeBefore: beforeSize,
    panelSizeAfter: afterSize,
    position,
  };
}

export { runVaultWorkspaceLayoutRegression };
