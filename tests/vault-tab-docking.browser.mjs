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
  const canvasBody = tab.playwright.locator('section[aria-label="Рабочее полотно"] > div.row-start-3');
  const panes = tab.playwright.locator("section[data-workspace-dock-slot]");
  const originalPaneCount = await panes.count();

  while (await panes.count() > 1) {
    await tab.playwright.locator('button[aria-label^="Убрать панель "]').last().click();
    await tab.playwright.waitForTimeout(180);
  }

  const inactiveTab = tab.playwright.locator(
    'nav[aria-label="Открытые файлы"] button[role="tab"][aria-selected="false"]',
  ).first();
  const [tabRect, canvasRect] = await Promise.all([readRect(inactiveTab), readRect(canvasBody)]);
  assert.ok(tabRect && canvasRect, "Вкладка и рабочее полотно должны быть видимы");

  const tabStart = {
    x: tabRect.x + Math.min(tabRect.width / 2, 72),
    y: tabRect.y + tabRect.height / 2,
  };
  const dockEnd = {
    x: canvasRect.x + 40,
    y: canvasRect.y + canvasRect.height / 2,
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

  const leftPane = tab.playwright.locator('#workspace-pane-topLeft[data-workspace-dock-slot="topLeft"]');
  const rightPane = tab.playwright.locator('#workspace-pane-topRight[data-workspace-dock-slot="topRight"]');
  const separator = tab.playwright.locator(
    '[role="separator"][aria-label="Изменить ширину областей документов"]',
  );
  assert.equal(await leftPane.count(), 1, "Drop в левую часть должен создать соседнюю область файла");
  assert.equal(await rightPane.count(), 1, "Вторая вкладка должна остаться справа");
  assert.equal(await separator.count(), 1, "Между областями должен появиться доступный ресайзер");

  const [leftBefore, centerBefore, separatorRect] = await Promise.all([
    readRect(leftPane),
    readRect(rightPane),
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

  const [leftAfter, centerAfter] = await Promise.all([readRect(leftPane), readRect(rightPane)]);
  assert.ok(leftAfter && centerAfter, "Области должны остаться видимыми после ресайза");
  assert.ok(
    leftAfter.width > leftBefore.width + 8 && centerAfter.width < centerBefore.width - 8,
    "Перетаскивание разделителя должно менять ширину обеих областей",
  );

  const leftHeader = leftPane.locator("header[data-workspace-pane-drag-handle]");
  const leftHeaderRect = await readRect(leftHeader);
  assert.ok(leftHeaderRect, "У панели должна быть перетаскиваемая верхушка");
  await tab.cua.drag({
    path: [
      { x: leftHeaderRect.x + Math.min(100, leftHeaderRect.width / 2), y: leftHeaderRect.y + leftHeaderRect.height / 2 },
      { x: canvasRect.x + canvasRect.width / 2, y: canvasRect.y + canvasRect.height * 0.65 },
      { x: canvasRect.x + canvasRect.width / 2, y: canvasRect.y + canvasRect.height - 40 },
    ],
  });
  await tab.playwright.waitForTimeout(260);
  assert.equal(
    await tab.playwright.getByRole("separator", { name: "Изменить высоту областей документов" }).count(),
    1,
    "Перетаскивание верхушки вниз должно перестроить области по вертикали",
  );

  const bottomPane = tab.playwright.locator('#workspace-pane-bottomLeft[data-workspace-dock-slot="bottomLeft"]');
  const bottomHeaderRect = await readRect(bottomPane.locator("header[data-workspace-pane-drag-handle]"));
  assert.ok(bottomHeaderRect, "Нижняя панель должна оставаться доступной для перетаскивания");
  await tab.cua.drag({
    path: [
      { x: bottomHeaderRect.x + Math.min(100, bottomHeaderRect.width / 2), y: bottomHeaderRect.y + bottomHeaderRect.height / 2 },
      { x: canvasRect.x + canvasRect.width * 0.35, y: canvasRect.y + canvasRect.height / 2 },
      { x: canvasRect.x + 40, y: canvasRect.y + canvasRect.height / 2 },
    ],
  });
  await tab.playwright.waitForTimeout(260);
  assert.equal(await separator.count(), 1, "Панель должна возвращаться в горизонтальное размещение");

  if (originalPaneCount === 1) {
    await tab.playwright.locator('button[aria-label^="Убрать панель "]').last().click();
    await tab.playwright.waitForTimeout(180);
  }

  return {
    centerWidthAfter: centerAfter.width,
    centerWidthBefore: centerBefore.width,
    leftWidthAfter: leftAfter.width,
    leftWidthBefore: leftBefore.width,
    paneCountRestored: await panes.count(),
  };
}

export { runVaultTabDockingRegression };
