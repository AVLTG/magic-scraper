import "server-only";
import chromium from "@sparticuz/chromium-min";
import puppeteer, { Browser } from "puppeteer-core";

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await chromium.executablePath(
    process.env.CHROMIUM_REMOTE_EXEC_PATH
  );
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
}
