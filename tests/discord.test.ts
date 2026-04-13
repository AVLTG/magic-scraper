/**
 * Tests for src/lib/discord.ts
 * Tests sendDiscordAlert: posts to webhook, handles missing URL, handles fetch failures
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { sendDiscordAlert } from '@/lib/discord';

describe('sendDiscordAlert', () => {
  const WEBHOOK_URL = 'https://discord.com/api/webhooks/test/token';

  beforeEach(() => {
    mockFetch.mockClear();
    delete process.env.DISCORD_WEBHOOK_URL;
  });

  it('posts to DISCORD_WEBHOOK_URL with content payload', async () => {
    process.env.DISCORD_WEBHOOK_URL = WEBHOOK_URL;
    mockFetch.mockResolvedValue({ ok: true, status: 204, text: async () => '' });

    await sendDiscordAlert({ content: 'Sync failed for Alice' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Sync failed for Alice' }),
    });
  });

  it('logs error and returns (no throw) when DISCORD_WEBHOOK_URL is unset', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendDiscordAlert({ content: 'test' })).resolves.toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DISCORD_WEBHOOK_URL'));

    consoleSpy.mockRestore();
  });

  it('logs error and returns (no throw) when fetch throws', async () => {
    process.env.DISCORD_WEBHOOK_URL = WEBHOOK_URL;
    mockFetch.mockRejectedValue(new Error('network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendDiscordAlert({ content: 'test' })).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Discord webhook POST failed'),
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('logs error and returns (no throw) when response is non-2xx', async () => {
    process.env.DISCORD_WEBHOOK_URL = WEBHOOK_URL;
    mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(sendDiscordAlert({ content: 'test' })).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('429'));

    consoleSpy.mockRestore();
  });
});
