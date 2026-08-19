import assert from "node:assert/strict";

const RESET_MESSAGE = "Настройки восстановлены по умолчанию";

async function openSettings(tab) {
  await tab.playwright.getByRole("button", { name: "Настройки панели Vault" }).click();
  await tab.playwright.getByRole("menuitem", { name: "Настройки приложения" }).click();
  await tab.playwright.getByRole("dialog", { name: "Настройки" }).waitFor({ state: "visible" });
}

async function readRect(locator) {
  return locator.evaluateAll((elements) => {
    const rect = elements[0]?.getBoundingClientRect();
    return rect ? { height: rect.height, width: rect.width } : null;
  });
}

async function readChecked(locator) {
  return locator.evaluateAll((elements) => Boolean(elements[0]?.checked));
}

async function runNotificationSettingsRegression(tab) {
  await openSettings(tab);

  const settingsDialog = tab.playwright.getByRole("dialog", { name: "Настройки" });
  const dialogRect = await readRect(settingsDialog);
  assert.ok(dialogRect, "Диалог настроек должен иметь видимую геометрию");
  assert.ok(dialogRect.width <= 608, `Диалог должен оставаться компактным, сейчас ${dialogRect.width}px`);
  assert.ok(dialogRect.height <= 720, `Диалог не должен превращаться в полноэкранную форму, сейчас ${dialogRect.height}px`);
  assert.equal(
    await settingsDialog.getByRole("switch").count(),
    2,
    "В основном потоке должны остаться только главный switch и пауза при наведении",
  );

  const categoryToggle = settingsDialog.getByRole("button", { name: /Типы уведомлений/ });
  const categoryRegionId = await categoryToggle.getAttribute("aria-controls");
  assert.ok(categoryRegionId, "Переключатель категорий должен быть связан с раскрываемой областью");
  const categoryRegion = settingsDialog.locator(`[id="${categoryRegionId}"]`);
  assert.equal(await categoryRegion.getAttribute("data-state"), "closed");
  assert.ok((await readRect(categoryRegion))?.height <= 1, "Закрытые категории не должны занимать место");

  await categoryToggle.click();
  assert.equal(await settingsDialog.locator('input[type="checkbox"]').count(), 4, "Категории должны быть компактным multi-select");
  await tab.playwright.waitForTimeout(230);
  const openCategoryRect = await readRect(categoryRegion);
  assert.ok(openCategoryRect && openCategoryRect.height > 80, "Раскрытие должно показать всю область категорий");
  const categoryMotion = await categoryRegion.evaluateAll((elements) => {
    const style = getComputedStyle(elements[0]);
    return {
      duration: style.transitionDuration,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  if (!categoryMotion.reduced) {
    assert.notEqual(categoryMotion.duration, "0s", "Раскрытие должно иметь CSS-переход");
  }

  await categoryToggle.click();
  assert.equal(await categoryRegion.count(), 1, "Закрывающаяся область должна оставаться в DOM для exit-анимации");
  assert.equal(await categoryRegion.getAttribute("data-state"), "closed");
  assert.equal(await categoryRegion.getAttribute("aria-hidden"), "true");
  const closingMotion = await categoryRegion.evaluateAll((elements) => {
    const style = getComputedStyle(elements[0]);
    return {
      duration: style.transitionDuration,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  if (!closingMotion.reduced) {
    assert.notEqual(closingMotion.duration, "0s", "Закрытие должно иметь CSS-переход");
  }
  await tab.playwright.waitForTimeout(170);
  assert.ok((await readRect(categoryRegion))?.height <= 1, "После закрытия категории не должны занимать место");

  const maxVisibleGroup = tab.playwright.getByRole("group", { name: "Одновременно" });
  await maxVisibleGroup.getByText("2", { exact: true }).click();
  assert.equal(
    await readChecked(maxVisibleGroup.locator('input[value="2"]')),
    true,
    "Выбранный лимит должен сразу отражаться в форме",
  );

  await tab.playwright.getByRole("button", { name: "Закрыть настройки" }).click();
  await tab.playwright.waitForTimeout(250);
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
  await tab.playwright.waitForTimeout(250);
  await openSettings(tab);

  assert.equal(
    await readChecked(tab.playwright.locator('input[name="settings-max-visible"][value="2"]')),
    true,
    "Настройки должны сохраняться после reload",
  );

  await tab.playwright.getByRole("button", { name: "Сбросить" }).click();
  await tab.playwright.getByRole("button", { name: "Закрыть настройки" }).click();
  await tab.playwright.waitForTimeout(100);

  const resetNotice = tab.playwright.getByText(RESET_MESSAGE, { exact: true });
  assert.equal(await resetNotice.isVisible(), true, "Сброс настроек должен показывать подтверждение");

  const noticeRect = await resetNotice.evaluateAll((elements) => {
    const card = elements[0]?.closest('[role="status"]');
    const rect = card?.getBoundingClientRect();
    return rect ? { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top } : null;
  });
  assert.ok(noticeRect, "Уведомление должно иметь видимую карточку");

  await tab.cua.move({
    x: (noticeRect.left + noticeRect.right) / 2,
    y: (noticeRect.top + noticeRect.bottom) / 2,
  });
  await tab.playwright.waitForTimeout(3_700);
  assert.equal(await resetNotice.isVisible(), true, "Наведение должно приостанавливать таймер уведомления");

  await tab.cua.move({ x: Math.max(8, noticeRect.left - 24), y: Math.max(8, noticeRect.top - 24) });
  await tab.playwright.waitForTimeout(3_700);
  assert.equal(await resetNotice.count(), 0, "После ухода курсора таймер должен продолжиться");

  await openSettings(tab);
  assert.equal(
    await readChecked(tab.playwright.locator('input[name="settings-max-visible"][value="3"]')),
    true,
    "Сброс должен вернуть лимит по умолчанию",
  );
  await tab.playwright.getByRole("button", { name: "Сбросить" }).click();
  await tab.playwright.getByRole("button", { name: "Закрыть настройки" }).click();
  await tab.playwright.waitForTimeout(100);

  const closeButton = tab.playwright.getByRole("button", { name: "Закрыть уведомление" });
  const closeSize = await closeButton.evaluateAll((elements) => {
    const rect = elements[0]?.getBoundingClientRect();
    return rect ? { height: rect.height, width: rect.width } : null;
  });
  assert.ok(closeSize && closeSize.height >= 32 && closeSize.width >= 32, "Кнопка закрытия должна быть не меньше 32×32px");
  await closeButton.click();
  await tab.playwright.waitForTimeout(250);
  assert.equal(await closeButton.count(), 0, "Ручное закрытие должно удалить уведомление");

  return {
    closeSize,
    hoverPause: true,
    persistedMaxVisible: 2,
    resetMaxVisible: 3,
  };
}

export { runNotificationSettingsRegression };
