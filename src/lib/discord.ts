export interface DiscordAlertPayload {
  content: string;
}

export async function sendDiscordAlert(payload: DiscordAlertPayload): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    console.error('DISCORD_WEBHOOK_URL not set — skipping alert');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (error) {
    console.error('Discord webhook POST failed:', error);
  }
}
