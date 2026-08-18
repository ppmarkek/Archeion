import assert from "node:assert/strict";

async function readRect(locator) {
  return locator.evaluateAll((elements) => {
    const rect = elements[0]?.getBoundingClientRect();
    return rect
      ? { height: rect.height, width: rect.width, x: rect.x, y: rect.y }
      : null;
  });
}

async function runVaultTabDockingRegression(tab) {
  const documentView = tab.playwright.getByRole("tab", { name: "Документ" });
  await documentView.click();

  const openTabs = tab.playwright.locator('nav[aria-label="Открытые файлы"] button[role="tab"]');
  assert.ok(await openTabs.count() >= 2, "Для docking-проверки нужны две открытые вкладки");

  const inactiveTab = tab.playwright.locator(
    'nav[aria-label="Открытые файлы"] button[role="tab"][aria-selected="false"]',
  ).first();
  const centerPane = tab.playwright.locator("#workspace-pane-center");
  const [tabRect, centerRect] = await Promise.all([readRect(inactiveTab), readRect(centerPane)]);
  assert.ok(tabRect && centerRect, "Вкладка и центральная область должны быть видимы");

  const tabStart = {
    x: tabRect.x + Math.min(tabRect.width / 2, 72),
    y: tabRect.y + tabRect.height / 2,
  };
  const dockEnd = {
    x: centerRect.x + Math.max(54, centerRect.width * 0.18),
    y: centerRect.y + Math.min(160, centerRect.height * 0.3),
  };
  await tab.cua.drag({
    path: [
      tabStart,
      { x: tabStart.x - 20, y: tabStart.y + 32 },
      { x: (tabStart.x + dockEnd.x) / 2, y: (tabStart.y + dockEnd.y) / 2 },
      dockEnd,
    ],
  });
  await tab.playwright.waitForTimeout(260);

  const leftPane = tab.playwright.locator('#workspace-pane-left[data-workspace-dock-slot="left"]');
  const separator = tab.playwright.locator(
    '[role="separator"][aria-label="Изменить ширину областей документов"]',
  );
  assert.equal(await leftPane.count(), 1, "Drop в левую часть должен создать соседнюю область файла");
  assert.equal(await separator.count(), 1, "Между областями должен появиться доступный ресайзер");

  const [leftBefore, centerBefore, separatorRect] = await Promise.all([
    readRect(leftPane),
    readRect(centerPane),
    readRect(separator),
  ]);
  assert.ok(leftBefore && centerBefore && separatorRect, "Обе области и ресайзер должны быть видимы");

  const separatorStart = {
    x: separatorRect.x + separatorRect.width / 2,
    y: separatorRect.y + Math.min(separatorRect.height / 2, 180),
  };
  await tab.cua.drag({
    path: [
      separatorStart,
      { x: separatorStart.x + 36, y: separatorStart.y },
      { x: separatorStart.x + 72, y: separatorStart.y },
    ],
  });
  await tab.playwright.waitForTimeout(180);

  const [leftAfter, centerAfter] = await Promise.all([readRect(leftPane), readRect(centerPane)]);
  assert.ok(leftAfter && centerAfter, "Области должны остаться видимыми после ресайза");
  assert.ok(
    leftAfter.width > leftBefore.width + 32 && centerAfter.width < centerBefore.width - 32,
    "Перетаскивание разделителя должно менять ширину обеих областей",
  );

  const closeLeft = tab.playwright.getByRole("button", { name: "Убрать панель слева" });
  await closeLeft.click();
  await tab.playwright.waitForTimeout(180);
  assert.equal(await leftPane.count(), 0, "После закрытия split должна остаться одна область");

  return {
    centerWidthAfter: centerAfter.width,
    centerWidthBefore: centerBefore.width,
    leftWidthAfter: leftAfter.width,
    leftWidthBefore: leftBefore.width,
  };
}

export { runVaultTabDockingRegression };
