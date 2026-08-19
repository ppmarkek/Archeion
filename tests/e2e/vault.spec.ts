import { expect, test } from "@playwright/test";

test("the Vault opens with its isolated welcome Note", async ({ page }) => {
  await page.goto("/vault");

  await expect(page.locator('section[aria-label="Панель Vault"]')).toBeVisible();
  await expect(page.locator(
    '[data-vault-library-path="Welcome to Archeion.md"]',
  )).toBeVisible();
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
