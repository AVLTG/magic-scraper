export interface DiscordAlertPayload {
  content: string;
}

// Resolves true only when Discord acknowledged the message. Callers that
// persist "notified" flags must not do so on failure — previously every
// error was swallowed here, so a dead webhook permanently marked games as
// notified with nothing ever delivered.
export async function sendDiscordAlert(payload: DiscordAlertPayload): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.error('DISCORD_WEBHOOK_URL not set — skipping alert');
    return false;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Discord webhook POST failed:', error);
    return false;
  }
}
