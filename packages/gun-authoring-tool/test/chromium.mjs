const { chromium } = await import('playwright');

export function launchChromium(args = []) {
  return chromium.launch({ headless: true, args });
}
