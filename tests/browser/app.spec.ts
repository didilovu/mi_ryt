import { test, expect } from "@playwright/test";
test("мобильный профиль, тренировка, пауза, история и офлайн", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Движение в вашем ритме" }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/moy-ritm-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByLabel("Вес, кг", { exact: true }).fill("64");
  await page.getByLabel("Возраст, лет").fill("32");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  await page.getByRole("button", { name: "Тренировки", exact: true }).click();
  await page.getByRole("button", { name: "Начать тренировку" }).first().click();
  await page
    .getByRole("button", { name: "Начать подход", exact: true })
    .click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.reload();
  await expect(page.getByText("На паузе · нажмите «Продолжить»")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.waitForTimeout(1000);
  await page
    .getByRole("button", { name: "Подход выполнен", exact: true })
    .click();
  await expect(
    page.getByText("Отдых — отдельно от активного времени"),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Завершить раньше" }).click();
  await expect(page.getByText("ТРЕНИРОВКА СОХРАНЕНА")).toBeVisible();
  await expect(
    page.getByText("Частично выполнена", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Вернуться к своему ритму" }).click();
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "История тренировок" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("64");
  await page.getByLabel("Вес, кг", { exact: true }).fill("70");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  const state = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("moy-ritm", 1);
      r.onsuccess = () => resolve(r.result);
    });
    return await new Promise<any>((resolve) => {
      const r = db.transaction("state").objectStore("state").get("main");
      r.onsuccess = () => resolve(r.result);
    });
  });
  expect(state.history).toHaveLength(1);
  expect(state.history[0].weight).toBe(64);
  expect(state.history[0].activeSeconds).toBeGreaterThan(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Движение в вашем ритме" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(page.getByLabel("Вес, кг", { exact: true })).toHaveValue("70");
  expect(errors).toEqual([]);
});
test("календарь, библиотека, измерения, импорт и экспорт", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Календарь", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Следующий месяц" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Следующий месяц" }).click();
  await page.getByRole("button", { name: "Тренировки", exact: true }).click();
  await page.getByRole("button", { name: "Упражнения", exact: true }).click();
  await page.getByRole("textbox", { name: "Поиск упражнений" }).fill("мостик");
  await expect(
    page.getByRole("heading", { name: "Ягодичный мостик" }),
  ).toBeVisible();
  await expect(page.locator("figure svg")).toHaveCount(2);
  await page.getByRole("button", { name: "Прогресс", exact: true }).click();
  await page.getByLabel("Вес, кг", { exact: true }).fill("63");
  await page.getByRole("button", { name: "Добавить измерение" }).click();
  await expect(
    page.getByText("Измерение сохранено.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/moy-ritm/);
  await page.locator("input[type=file]").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(page.getByRole("status")).toContainText(
    "Не удалось импортировать",
  );
});
