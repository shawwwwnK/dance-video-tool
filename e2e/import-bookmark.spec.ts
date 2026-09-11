import { expect, test, type Page } from "@playwright/test";

/**
 * Build the test input in Chromium so no video bytes or external fixture need
 * to be checked into the repository. MediaRecorder's WebM output is a real
 * local media file and exercises the upload and browser media paths together.
 */
async function createLocalWebM(page: Page): Promise<Buffer> {
  const bytes = await page.evaluate(async () => {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      throw new Error("Chromium does not support local WebM generation.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas for the WebM fixture.");

    const stream = canvas.captureStream(10);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", () => reject(new Error("Could not record a local WebM fixture.")), { once: true });
    });

    recorder.start();
    const started = performance.now();
    while (performance.now() - started < 500) {
      const elapsed = performance.now() - started;
      context.fillStyle = elapsed < 250 ? "#d7f64c" : "#272a31";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: "video/webm" });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  return Buffer.from(bytes);
}

test("imports a local WebM, saves a bookmark, and restores it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Your imported videos will appear here.")).toBeVisible();

  const fixture = await createLocalWebM(page);
  expect(fixture.length).toBeGreaterThan(0);

  const fileInput = page.locator('aside[aria-label="Video library"] input[type="file"]').first();
  await fileInput.setInputFiles({
    name: "practice.webm",
    mimeType: "video/webm",
    buffer: fixture,
  });

  await expect(page.getByText("practice.webm", { exact: true })).toBeVisible();
  const addBookmark = page.getByRole("button", { name: /Bookmark/ });
  await expect(addBookmark).toBeEnabled({ timeout: 30_000 });
  await addBookmark.click();

  const editor = page.locator(".new-bookmark");
  await expect(editor).toBeVisible();
  const title = editor.getByRole("textbox", { name: "Title" });
  await expect(title).toBeFocused();
  await title.fill("First rehearsal mark");
  await editor.getByRole("button", { name: "Save bookmark" }).click();

  const savedBookmark = page.getByRole("button", { name: /First rehearsal mark/ });
  await expect(savedBookmark).toBeVisible();
  await expect(page.getByText("1 saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("practice.webm", { exact: true })).toBeVisible();
  await expect(page.getByText("First rehearsal mark", { exact: true })).toBeVisible();
  await expect(page.getByText("1 saved", { exact: true })).toBeVisible();
});
