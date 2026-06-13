// Games-tab deck auto-creation (issue #7): a new deckName typed into the game
// form becomes a real name-only Deck (no card associations). Owner = the User
// whose name matches the participant's playerName; no match -> ownerless.
// Random participants' decks are never saved. Best-effort by design: any
// failure here logs and returns — the game save must never fail because of it.
import { prisma } from './prisma';

export interface ParticipantDeckInfo {
  playerName: string;
  deckName?: string;
  isRandom: boolean;
}

export async function ensureDecksForParticipants(
  participants: ParticipantDeckInfo[]
): Promise<void> {
  try {
    const candidates = participants.filter(
      (p) => !p.isRandom && p.deckName && p.deckName.trim().length > 0
    );
    if (candidates.length === 0) return;

    const [decks, users] = await Promise.all([
      prisma.deck.findMany({ select: { name: true } }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const existing = new Set(decks.map((d) => d.name.trim().toLowerCase()));
    const usersByName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));

    for (const p of candidates) {
      const deckName = (p.deckName as string).trim();
      const key = deckName.toLowerCase();
      if (existing.has(key)) continue;
      const ownerUserId = usersByName.get(p.playerName.trim().toLowerCase()) ?? null;
      await prisma.deck.create({ data: { name: deckName, ownerUserId } });
      existing.add(key);
    }
  } catch (error) {
    console.error('Deck auto-creation failed (game save unaffected):', error);
  }
}
