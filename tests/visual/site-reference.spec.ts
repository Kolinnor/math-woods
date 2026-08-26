import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function loadBuiltLayoutCss() {
  if (process.env.VISUAL_INJECT_BUILD_CSS !== "1") return null;

  const manifest = JSON.parse(fs.readFileSync(".next/app-build-manifest.json", "utf8")) as {
    pages: Record<string, string[]>;
  };
  const stylesheets = (manifest.pages["/layout"] ?? []).filter((entry) => entry.startsWith("static/css/"));

  if (stylesheets.length === 0) {
    throw new Error("The production build does not contain layout stylesheets.");
  }

  return stylesheets
    .map((stylesheet) => fs.readFileSync(path.join(".next", ...stylesheet.split("/")), "utf8"))
    .join("\n");
}

const builtLayoutCss = loadBuiltLayoutCss();

const pages = [
  { name: "home-guest", path: "/" },
  { name: "problems-browser", path: "/problems" },
  { name: "problem-detail", path: "/problems/la-piece-manquante" },
  { name: "concepts-browser", path: "/concepts" },
  { name: "concept-detail", path: "/concepts/norme" },
  { name: "users", path: "/users" },
  { name: "contributing", path: "/contributing" },
  { name: "about", path: "/about" }
] as const;

async function settlePage(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    images.forEach((image) => {
      image.loading = "eager";
    });

    await Promise.race([
      Promise.all(
        images
          .filter((image) => !image.complete)
          .map((image) => new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
          }))
      ),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5_000))
    ]);

    await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  });
}

for (const referencePage of pages) {
  test(referencePage.name, async ({ context, page, baseURL }) => {
    if (!baseURL) throw new Error("A visual base URL is required.");

    await context.addCookies([
      {
        name: "math-woods-language",
        value: "fr",
        url: baseURL
      }
    ]);

    await page.goto(referencePage.path, { waitUntil: "domcontentloaded" });
    await settlePage(page);

    const screenshotOptions = {
      animations: "disabled" as const,
      caret: "hide" as const,
      fullPage: true,
      mask: [page.locator("time")]
    };

    if (builtLayoutCss) {
      const stableScreenshot = await page.screenshot(screenshotOptions);

      await page.addStyleTag({ content: builtLayoutCss });
      await page.locator('link[rel="stylesheet"]').evaluateAll((stylesheets) => {
        stylesheets.forEach((stylesheet) => stylesheet.remove());
      });
      await page.evaluate(() => new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      }));

      const builtScreenshot = await page.screenshot(screenshotOptions);
      expect(
        builtScreenshot.equals(stableScreenshot),
        `${referencePage.name} changed after injecting the local production CSS.`
      ).toBe(true);
      return;
    }

    await expect(page).toHaveScreenshot(`${referencePage.name}.png`, {
      ...screenshotOptions
    });
  });
}
