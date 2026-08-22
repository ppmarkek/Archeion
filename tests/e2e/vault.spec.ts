import { expect, test } from "@playwright/test";

test("the Vault opens with its isolated welcome Note", async ({ page }) => {
  await page.goto("/vault");

  await expect(page.locator('section[aria-label="Панель Vault"]')).toBeVisible();
  await expect(page.locator(
    '[data-vault-library-path="Welcome to Archeion.md"]',
  )).toBeVisible();
});

test("a late read from a closed tab cannot overwrite a reopened Note", async ({ page }) => {
  const title = "Stale read";
  const path = `${title}.md`;
  const firstReadStarted = Promise.withResolvers<void>();
  const secondReadStarted = Promise.withResolvers<void>();
  const staleReadCanFinish = Promise.withResolvers<void>();
  let readAttempt = 0;

  await page.goto("/vault");
  await expect(page.getByRole("textbox", { name: "Редактор Markdown", exact: true })).toBeVisible();
  await page.getByTitle("Создать заметку: Корень Vault").click();
  const noteDialog = page.getByRole("dialog", { name: "Новая заметка" });
  await noteDialog.getByLabel("Название заметки").fill(title);
  await noteDialog.getByRole("button", { name: "Готово" }).click();

  const libraryItem = page.locator(`[data-vault-library-path="${path}"]`);
  const workspaceTab = page.locator(`[data-workspace-tab-path="${path}"]`);
  const closeWorkspaceTab = page.getByRole("button", { name: `Закрыть ${title}`, exact: true });
  await expect(libraryItem).toBeVisible();
  await closeWorkspaceTab.click();
  await expect(workspaceTab).toHaveCount(0);

  await page.route("**/api/vault/note?*", async (route) => {
    const request = route.request();
    const requestedPath = new URL(request.url()).searchParams.get("path");
    if (request.method() !== "GET" || requestedPath !== path) {
      await route.continue();
      return;
    }

    readAttempt += 1;
    if (readAttempt === 1) {
      firstReadStarted.resolve();
      await staleReadCanFinish.promise;
      await route.fulfill({
        body: JSON.stringify({ content: "# Stale response" }),
        contentType: "application/json",
        headers: { "x-archeion-test-response": "stale" },
        status: 200,
      });
      return;
    }

    if (readAttempt !== 2) throw new Error(`Unexpected Note read attempt: ${readAttempt}`);
    secondReadStarted.resolve();

    await route.fulfill({
      body: JSON.stringify({ content: "# Fresh response" }),
      contentType: "application/json",
      status: 200,
    });
  });

  try {
    await libraryItem.dispatchEvent("click");
    await firstReadStarted.promise;
    await closeWorkspaceTab.click();
    await expect(workspaceTab).toHaveCount(0);

    await libraryItem.dispatchEvent("click");
    await secondReadStarted.promise;
    const editor = page.getByRole("textbox", { name: "Редактор Markdown", exact: true });
    await expect(editor).toHaveValue("# Fresh response");

    expect(readAttempt).toBe(2);
    const staleResponsePromise = page.waitForResponse((response) => {
      const responsePath = new URL(response.url()).searchParams.get("path");
      return response.request().method() === "GET"
        && responsePath === path
        && response.headers()["x-archeion-test-response"] === "stale";
    });
    staleReadCanFinish.resolve();
    const staleResponse = await staleResponsePromise;
    await staleResponse.finished();
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    await expect(editor).toHaveValue("# Fresh response");
  } finally {
    staleReadCanFinish.resolve();
    const cleanupResponse = await page.request.delete("/api/vault/item", {
      data: { path },
    });
    expect(cleanupResponse.ok()).toBe(true);
  }
});

test("a user can create, find, reorganize, and delete a Note", async ({ page }) => {
  await page.goto("/vault");

  await page.getByTitle("Создать папку: Корень Vault").click();
  const folderDialog = page.getByRole("dialog", { name: "Новая папка" });
  await folderDialog.getByLabel("Название папки").fill("Study");
  await folderDialog.getByRole("button", { name: "Готово" }).click();

  const folderRow = page.locator('[data-vault-library-path="Study"]');
  await expect(folderRow).toBeVisible();
  await folderRow.click();

  await page.getByTitle("Создать заметку: Study").click();
  const noteDialog = page.getByRole("dialog", { name: "Новая заметка" });
  await noteDialog.getByLabel("Название заметки").fill("Physics basics");
  await noteDialog.getByRole("button", { name: "Готово" }).click();

  await expect(page.locator(
    '[data-vault-library-path="Study/Physics basics.md"]',
  )).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Редактор Markdown" });
  await expect(editor).toBeVisible();
  await editor.fill("# Acceleration\n\nForce and motion.");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранено", exact: true })).toBeDisabled();

  const search = page.getByPlaceholder("Поиск в файлах");
  await search.fill("Acceleration");
  await expect(page.getByRole("listbox", { name: "Результаты поиска" })).toBeVisible();
  await expect(page.locator(
    '[data-vault-library-path="Study/Physics basics.md"]',
  )).toBeVisible();
  await page.getByRole("button", { name: "Очистить поиск" }).click();
  await expect(search).toHaveValue("");

  const noteRow = page.locator('[data-vault-library-path="Study/Physics basics.md"]');
  await noteRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: /Переименовать/u }).click();
  const renameDialog = page.getByRole("dialog", { name: "Переименовать" });
  await renameDialog.getByLabel("Новое название").fill("Motion basics");
  await renameDialog.getByRole("button", { name: "Готово" }).click();

  const renamedRow = page.locator('[data-vault-library-path="Study/Motion basics.md"]');
  await expect(renamedRow).toBeVisible();
  await renamedRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Переместить", exact: true }).click();
  const moveDialog = page.getByRole("dialog", { name: "Переместить" });
  await moveDialog.getByLabel("Новая папка").selectOption("");
  await moveDialog.getByRole("button", { name: "Готово" }).click();

  const movedNoteRow = page.locator('[data-vault-library-path="Motion basics.md"]');
  await expect(movedNoteRow).toBeVisible();

  await page.reload();
  const restoredNoteRow = page.locator(
    '[data-vault-library-path="Motion basics.md"]',
  );
  await expect(restoredNoteRow).toBeVisible();
  await restoredNoteRow.click();
  await expect(page.getByRole("textbox", { name: "Редактор Markdown" })).toHaveValue(
    "# Acceleration\n\nForce and motion.",
  );

  await restoredNoteRow.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Удалить" });
  await deleteDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(restoredNoteRow).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-vault-library-path="Motion basics.md"]')).toHaveCount(0);
});

test("tabs retain independent modes and restore their split workspace after reload", async ({ page }) => {
  const welcomePath = "Welcome to Archeion.md";
  const layoutPath = "Workspace layout.md";
  const documentMode = page.locator('[aria-label="Режим документа"]');

  await page.goto("/vault");
  await expect(page.locator(`[data-workspace-tab-path="${welcomePath}"]`)).toBeVisible();

  await documentMode.getByRole("tab", { name: "Просмотр", exact: true }).click();
  await expect(documentMode.getByRole("tab", { name: "Просмотр", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByTitle("Создать заметку: Корень Vault").click();
  const noteDialog = page.getByRole("dialog", { name: "Новая заметка" });
  await noteDialog.getByLabel("Название заметки").fill("Workspace layout");
  await noteDialog.getByRole("button", { name: "Готово" }).click();
  await expect(page.locator(`[data-vault-library-path="${layoutPath}"]`)).toBeVisible();

  await documentMode.getByRole("tab", { name: "Редактор", exact: true }).click();
  await expect(documentMode.getByRole("tab", { name: "Редактор", exact: true })).toHaveAttribute("aria-selected", "true");

  const openTabs = page.locator('nav[aria-label="Открытые файлы"]');
  await openTabs.locator(`[data-workspace-tab-path="${welcomePath}"]`).click();
  await expect(documentMode.getByRole("tab", { name: "Просмотр", exact: true })).toHaveAttribute("aria-selected", "true");

  await openTabs.locator(`[data-workspace-tab-path="${layoutPath}"]`).click();
  await expect(documentMode.getByRole("tab", { name: "Редактор", exact: true })).toHaveAttribute("aria-selected", "true");

  const welcomeTab = openTabs.locator(`[data-workspace-tab-path="${welcomePath}"]`);
  const layoutTab = openTabs.locator(`[data-workspace-tab-path="${layoutPath}"]`);
  const [welcomeTabReorderBox, layoutTabReorderBox] = await Promise.all([
    welcomeTab.boundingBox(),
    layoutTab.boundingBox(),
  ]);
  expect(welcomeTabReorderBox).not.toBeNull();
  expect(layoutTabReorderBox).not.toBeNull();
  if (!welcomeTabReorderBox || !layoutTabReorderBox) return;

  await page.mouse.move(
    welcomeTabReorderBox.x + welcomeTabReorderBox.width / 2,
    welcomeTabReorderBox.y + welcomeTabReorderBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    welcomeTabReorderBox.x + welcomeTabReorderBox.width / 2 + 12,
    welcomeTabReorderBox.y + welcomeTabReorderBox.height / 2,
    { steps: 3 },
  );
  await page.mouse.move(
    layoutTabReorderBox.x + layoutTabReorderBox.width * 0.25,
    layoutTabReorderBox.y + layoutTabReorderBox.height / 2,
    { steps: 6 },
  );
  await expect(page.locator("[data-workspace-tab-drop-indicator]")).toHaveCount(0);
  await page.mouse.move(
    layoutTabReorderBox.x + layoutTabReorderBox.width * 0.75,
    layoutTabReorderBox.y + layoutTabReorderBox.height / 2,
    { steps: 6 },
  );
  await expect(page.locator("[data-workspace-tab-drop-indicator]")).toHaveCount(1);
  await expect(layoutTab.locator("[data-workspace-tab-drop-indicator]")).toHaveCount(0);
  await expect(page.locator(
    "[data-workspace-tab-strip-dropzone] [data-workspace-tab-drop-indicator]",
  )).toHaveCount(1);
  await page.mouse.move(
    layoutTabReorderBox.x + layoutTabReorderBox.width * 0.25,
    layoutTabReorderBox.y + layoutTabReorderBox.height / 2,
    { steps: 6 },
  );
  await page.mouse.up();

  const canvas = page.locator('section[aria-label="Рабочее полотно"] > div.row-start-3');
  const [tabBox, canvasBox] = await Promise.all([welcomeTab.boundingBox(), canvas.boundingBox()]);
  expect(tabBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  if (!tabBox || !canvasBox) return;

  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2 - 12, tabBox.y + tabBox.height / 2 + 12, { steps: 3 });
  await page.mouse.move(canvasBox.x + 24, canvasBox.y + canvasBox.height / 2, { steps: 12 });
  await page.mouse.up();

  const leftPane = page.locator('#workspace-pane-topLeft[data-workspace-dock-slot="topLeft"]');
  const rightPane = page.locator('#workspace-pane-topRight[data-workspace-dock-slot="topRight"]');
  const divider = page.getByRole("separator", { name: "Изменить ширину областей документов" });
  await expect(leftPane).toBeVisible();
  await expect(rightPane).toBeVisible();
  await expect(leftPane.locator(`[data-workspace-pane-drag-handle="${welcomePath}"]`)).toBeVisible();
  await expect(rightPane.locator(`[data-workspace-pane-drag-handle="${layoutPath}"]`)).toBeVisible();

  await divider.focus();
  await divider.press("ArrowRight");
  await divider.press("ArrowRight");
  const ratioBeforeReload = Number(await divider.getAttribute("aria-valuenow"));
  expect(ratioBeforeReload).toBeGreaterThan(50);
  await page.waitForTimeout(350);

  await page.reload();
  const restoredDivider = page.getByRole("separator", { name: "Изменить ширину областей документов" });
  const restoredLeftPane = page.locator('#workspace-pane-topLeft[data-workspace-dock-slot="topLeft"]');
  const restoredRightPane = page.locator('#workspace-pane-topRight[data-workspace-dock-slot="topRight"]');
  await expect(restoredLeftPane.locator(`[data-workspace-pane-drag-handle="${welcomePath}"]`)).toBeVisible();
  await expect(restoredRightPane.locator(`[data-workspace-pane-drag-handle="${layoutPath}"]`)).toBeVisible();
  await expect(restoredDivider).toBeVisible();

  const ratioAfterReload = Number(await restoredDivider.getAttribute("aria-valuenow"));
  expect(Math.abs(ratioAfterReload - ratioBeforeReload)).toBeLessThanOrEqual(1);

  const restoredGroup = page.locator("[data-workspace-tab-group]");
  const groupedLayoutTab = restoredGroup.locator(`[data-workspace-tab-path="${layoutPath}"]`);
  await groupedLayoutTab.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Убрать из разделения", exact: true }).click();

  await expect(restoredDivider).toHaveCount(0);
  await expect(restoredGroup).toHaveCount(0);
  await expect(openTabs.locator(`[data-workspace-tab-path="${layoutPath}"]`)).toBeVisible();

  const standaloneLayoutTab = openTabs.locator(`[data-workspace-tab-path="${layoutPath}"]`);
  const [standaloneTabBox, restoredCanvasBox] = await Promise.all([
    standaloneLayoutTab.boundingBox(),
    canvas.boundingBox(),
  ]);
  expect(standaloneTabBox).not.toBeNull();
  expect(restoredCanvasBox).not.toBeNull();
  if (!standaloneTabBox || !restoredCanvasBox) return;

  await page.mouse.move(
    standaloneTabBox.x + standaloneTabBox.width / 2,
    standaloneTabBox.y + standaloneTabBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(standaloneTabBox.x, standaloneTabBox.y + standaloneTabBox.height + 12, { steps: 3 });
  await page.mouse.move(
    restoredCanvasBox.x + restoredCanvasBox.width - 24,
    restoredCanvasBox.y + restoredCanvasBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(restoredDivider).toBeVisible();
  const regroupedWelcomeTab = restoredGroup.locator(`[data-workspace-tab-path="${welcomePath}"]`);
  await regroupedWelcomeTab.focus();
  await regroupedWelcomeTab.press("Shift+F10");
  await expect(page.getByRole("menuitem", { name: "Убрать из разделения", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  const groupedWelcomeBox = await regroupedWelcomeTab.boundingBox();
  const stripDropZoneBox = await page.locator("[data-workspace-tab-strip-dropzone]").boundingBox();
  expect(groupedWelcomeBox).not.toBeNull();
  expect(stripDropZoneBox).not.toBeNull();
  if (!groupedWelcomeBox || !stripDropZoneBox) return;

  await page.mouse.move(
    groupedWelcomeBox.x + groupedWelcomeBox.width / 2,
    groupedWelcomeBox.y + groupedWelcomeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(groupedWelcomeBox.x, groupedWelcomeBox.y + groupedWelcomeBox.height / 2, { steps: 3 });
  await page.mouse.move(
    stripDropZoneBox.x + stripDropZoneBox.width / 2,
    stripDropZoneBox.y + stripDropZoneBox.height / 2,
    { steps: 10 },
  );
  await expect(page.locator("[data-workspace-tab-drop-indicator]")).toBeVisible();
  await page.mouse.up();

  await expect(restoredDivider).toHaveCount(0);
  await expect(restoredGroup).toHaveCount(0);
  await expect(openTabs.locator("[data-workspace-tab-path]")).toHaveCount(2);
  expect(await openTabs.locator("[data-workspace-tab-path]").evaluateAll((nodes) => (
    nodes.map((node) => (node as HTMLElement).dataset.workspaceTabPath)
  ))).toEqual([layoutPath, welcomePath]);

  await page.waitForTimeout(350);
  await page.reload();
  await expect(page.getByRole("separator", { name: "Изменить ширину областей документов" })).toHaveCount(0);
  await expect(page.locator("[data-workspace-tab-group]")).toHaveCount(0);
  expect(await page.locator("[data-workspace-tab-path]").evaluateAll((nodes) => (
    nodes.map((node) => (node as HTMLElement).dataset.workspaceTabPath)
  ))).toEqual([layoutPath, welcomePath]);
});

test("an overflowing tab strip auto-scrolls while a tab is dragged near its edge", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 760 });
  const overflowPaths = Array.from({ length: 7 }, (_, index) => `Overflow tab ${index + 1}.md`);
  for (const [index] of overflowPaths.entries()) {
    const response = await page.request.post("/api/vault", {
      data: { directory: "", title: `Overflow tab ${index + 1}`, type: "note" },
    });
    expect(response.ok()).toBe(true);
  }

  await page.goto("/vault");
  for (const path of overflowPaths) {
    await page.locator(`[data-vault-library-path="${path}"]`).click();
  }
  await page.locator('[data-vault-library-path="Welcome to Archeion.md"]').click();

  const strip = page.locator("[data-workspace-tab-scroll]");
  await expect(strip.locator("[data-workspace-tab-path]")).toHaveCount(8);
  expect(await strip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await strip.evaluate((element) => { element.scrollLeft = 0; });

  const firstTab = strip.locator(`[data-workspace-tab-path="${overflowPaths[0]}"]`);
  const [firstTabBox, stripBox] = await Promise.all([firstTab.boundingBox(), strip.boundingBox()]);
  expect(firstTabBox).not.toBeNull();
  expect(stripBox).not.toBeNull();
  if (!firstTabBox || !stripBox) return;

  await page.mouse.move(firstTabBox.x + firstTabBox.width / 2, firstTabBox.y + firstTabBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstTabBox.x + firstTabBox.width, firstTabBox.y + firstTabBox.height / 2, { steps: 3 });
  await page.mouse.move(stripBox.x + stripBox.width - 4, stripBox.y + stripBox.height / 2, { steps: 10 });
  await page.waitForTimeout(350);

  expect(await strip.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator("[data-workspace-tab-drop-indicator]")).toBeVisible();
  await page.mouse.up();
});
