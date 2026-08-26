import { expect, test, type Page } from "@playwright/test";

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

    await expect(page).toHaveScreenshot(`${referencePage.name}.png`, {
      fullPage: true,
      mask: [page.locator("time")]
    });
  });
}
