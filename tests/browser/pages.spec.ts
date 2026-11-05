import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
test("GitHub Pages: ресурсы, manifest и офлайн под /mi_ryt/", async ({
  page,
  context,
}) => {
  const root = resolve("dist");
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    if (!url.pathname.startsWith("/mi_ryt/")) {
      res.writeHead(404).end();
      return;
    }
    const file = resolve(
      root,
      decodeURIComponent(url.pathname.slice("/mi_ryt/".length)) || "index.html",
    );
    if (!file.startsWith(root + "/")) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            (
              {
                ".html": "text/html",
                ".js": "text/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".webmanifest": "application/manifest+json",
                ".svg": "image/svg+xml",
                ".png": "image/png",
              } as Record<string, string>
            )[extname(file)] ?? "application/octet-stream",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(4183, "127.0.0.1", r));
  try {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:4183/mi_ryt/");
    await expect(
      page.getByRole("heading", { name: "Движение в вашем ритме" }),
    ).toBeVisible();
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).toBe("http://127.0.0.1:4183/mi_ryt/");
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    const manifest = await page.evaluate(async () => {
      const url = (
        document.querySelector("link[rel=manifest]") as HTMLLinkElement
      ).href;
      return { url, data: await (await fetch(url)).json() };
    });
    expect(new URL(manifest.data.start_url, manifest.url).pathname).toBe(
      "/mi_ryt/",
    );
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Движение в вашем ритме" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Тренировки", exact: true }).click();
    await page.getByRole("button", { name: "Упражнения", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Приседания", exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
