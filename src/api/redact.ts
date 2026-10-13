/**
 * Hides the API key wherever a URL or message is written to logs or reports.
 * The Allure report is published on GitHub Pages, so this must never leak the key.
 */
export function redact(text: string, secret?: string): string {
  let out = text.replace(/([?&]appid=)[^&\s"']*/gi, '$1***');
  if (secret) out = out.split(secret).join('***');
  return out;
}
