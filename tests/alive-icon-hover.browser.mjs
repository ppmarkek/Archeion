import assert from "node:assert/strict";

const ACTIVE = "active";
const REST = "rest";

async function readVisualState(icon) {
  return icon.evaluateAll((elements) => {
    const element = elements[0];
    const animatedDescendants = [...element.querySelectorAll("*")].filter(
      (descendant) => getComputedStyle(descendant).animationName !== "none",
    );

    return {
      animatedDescendantCount: animatedDescendants.length,
      replay: Number(element.getAttribute("data-icon-replay")),
      state: element.getAttribute("data-icon-state"),
    };
  });
}

async function runAliveIconHoverRegression(tab) {
  const icon = tab.playwright.locator(
    'section[aria-label="Панель Vault"] [aria-label="Создание и импорт"] button:first-child .alive-icon[data-icon-motion="hover"]',
  );
  const staticIcon = tab.playwright.locator(
    'section[aria-label="Панель Vault"] button[role="tab"][aria-selected="true"] .alive-icon[data-icon-motion="none"]',
  );

  assert.equal(
    await icon.count(),
    1,
    "Тестовая кнопка должна содержать ровно одну hover-иконку",
  );
  assert.equal(
    await staticIcon.count(),
    1,
    "Плотный переключатель представления должен содержать статичную иконку",
  );

  const geometry = await icon.evaluateAll((elements) => {
    const element = elements[0];
    const iconRect = element.getBoundingClientRect();
    const controlRect = element.parentElement?.getBoundingClientRect();

    return {
      control: controlRect
        ? {
            bottom: controlRect.bottom,
            left: controlRect.left,
            right: controlRect.right,
            top: controlRect.top,
          }
        : null,
      icon: {
        bottom: iconRect.bottom,
        left: iconRect.left,
        right: iconRect.right,
        top: iconRect.top,
      },
    };
  });

  assert.ok(geometry.control, "Иконка должна находиться внутри semantic control");

  const controlHoverPoint = {
    x: geometry.control.right - 10,
    y: (geometry.control.top + geometry.control.bottom) / 2,
  };
  const outsideControlPoint = {
    x: (geometry.control.left + geometry.control.right) / 2,
    y: geometry.control.bottom + 12,
  };

  assert.ok(
    controlHoverPoint.x > geometry.icon.right ||
      controlHoverPoint.x < geometry.icon.left,
    "Контрольная точка должна быть внутри кнопки, но вне самой иконки",
  );

  await tab.cua.move(outsideControlPoint);
  await tab.playwright.waitForTimeout(40);
  assert.equal(
    (await readVisualState(icon)).state,
    REST,
    "Вне логического контрола иконка должна оставаться в rest-состоянии",
  );

  await staticIcon.evaluateAll((elements) => {
    const control = elements[0].closest("button");
    control?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  const staticControlPoint = await staticIcon.evaluateAll((elements) => {
    const control = elements[0].closest("button");
    const rect = control?.getBoundingClientRect();
    return rect ? { x: rect.right - 10, y: (rect.top + rect.bottom) / 2 } : null;
  });
  assert.ok(staticControlPoint, "Статичная иконка должна находиться внутри кнопки");
  await tab.cua.move(staticControlPoint);
  await tab.playwright.waitForTimeout(40);
  const staticHover = await readVisualState(staticIcon);
  assert.equal(
    staticHover.state,
    REST,
    "Наведение на плотный переключатель не должно анимировать его иконку",
  );
  assert.equal(
    staticHover.animatedDescendantCount,
    0,
    "Статичная иконка не должна запускать CSS-анимацию",
  );

  await tab.cua.move(controlHoverPoint);
  await tab.playwright.waitForTimeout(40);
  const firstHover = await readVisualState(icon);
  assert.equal(
    firstHover.state,
    ACTIVE,
    "Pointer enter любой части логического контрола должен включить active-состояние иконки",
  );
  assert.ok(
    firstHover.animatedDescendantCount > 0,
    "В active-состоянии SVG должен иметь настоящую CSS-анимацию",
  );

  await tab.playwright.waitForTimeout(1700);
  assert.equal(
    (await readVisualState(icon)).state,
    ACTIVE,
    "Пока курсор остаётся на логическом контроле, active-состояние не должно сбрасываться таймером",
  );

  await tab.cua.move(outsideControlPoint);
  await tab.playwright.waitForTimeout(40);
  const afterLeave = await readVisualState(icon);
  assert.equal(
    afterLeave.state,
    REST,
    "Pointer leave логического контрола должен немедленно вернуть rest-состояние",
  );
  assert.equal(
    afterLeave.animatedDescendantCount,
    0,
    "После pointer leave SVG-анимация должна быть полностью сброшена",
  );

  await tab.cua.move(controlHoverPoint);
  await tab.playwright.waitForTimeout(40);
  const secondHover = await readVisualState(icon);
  assert.equal(
    secondHover.state,
    ACTIVE,
    "Повторный pointer enter должен снова включить active-состояние",
  );
  assert.ok(
    secondHover.replay > firstHover.replay,
    "Повторное наведение должно создать новый цикл CSS-анимаций",
  );

  await tab.cua.move(outsideControlPoint);
  await tab.playwright.waitForTimeout(40);
  assert.equal(
    (await readVisualState(icon)).state,
    REST,
    "После завершения теста иконка должна остаться в rest-состоянии",
  );

  return {
    animatedControl: "Новая",
    firstReplay: firstHover.replay,
    secondReplay: secondHover.replay,
    staticControl: "Папки",
  };
}

export { runAliveIconHoverRegression };
