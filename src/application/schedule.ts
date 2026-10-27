import { imageKeysOf, parseEvent } from "@/domain/sections";
import type { Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { assertOwnImage, loadWedding, releaseImages } from "./owned";
import type { Wedding, WeddingEvent } from "./ports";

/**
 * The Ablauf: the wedding's events. Website versions show them through event blocks, the invitations and the
 * response form pick from them, so an event has exactly one copy of its time and place.
 */

async function validEvent(deps: Deps, weddingId: string, input: unknown) {
  const parsed = parseEvent(input);
  if (!parsed.ok) throw new ValidationError(parsed.fieldErrors);
  for (const key of imageKeysOf(parsed.value)) await assertOwnImage(deps, weddingId, key);
  return parsed.value;
}

async function loadEvent(deps: Deps, userId: string, weddingId: string, eventId: string) {
  const wedding = await loadWedding(deps, userId, weddingId);
  const event = await deps.weddings.findEvent(wedding.id, eventId).catch(() => null);
  if (!event) throw new NotFoundError();
  return { wedding, event };
}

export class ListEvents {
  constructor(private deps: Deps) {}

  /** Chronological. */
  async execute(userId: string, weddingId: string): Promise<{ wedding: Wedding; events: WeddingEvent[] }> {
    const wedding = await loadWedding(this.deps, userId, weddingId);
    return { wedding, events: await this.deps.weddings.listEvents(wedding.id) };
  }
}

export class AddEvent {
  constructor(private deps: Deps) {}

  /** The wedding's first event also fills the invitations that have none yet (there was nothing to choose before). */
  async execute(userId: string, weddingId: string, input: unknown): Promise<WeddingEvent> {
    const wedding = await loadWedding(this.deps, userId, weddingId);
    const data = await validEvent(this.deps, wedding.id, input);
    const event = await this.deps.weddings.addEvent(wedding.id, data);
    if ((await this.deps.weddings.listEvents(wedding.id)).length > 1) return event;
    for (const card of await this.deps.cards.listByWedding(wedding.id)) {
      if (card.kind !== "invitation" || card.content.eventId) continue;
      const { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, content, message, reminderDays, reminderMessage } = card;
      await this.deps.cards.update(card.id, { themeId, paletteId, fontPairingId, layoutId, envelope, photoKey, content: { ...content, eventId: event.id }, message, reminderDays, reminderMessage });
    }
    return event;
  }
}

export class UpdateEvent {
  constructor(private deps: Deps) {}

  /** Changes the event everywhere: every website version, the invitations and the response form. */
  async execute(userId: string, weddingId: string, eventId: string, input: unknown): Promise<void> {
    const { wedding, event } = await loadEvent(this.deps, userId, weddingId, eventId);
    const data = await validEvent(this.deps, wedding.id, input);
    await this.deps.weddings.updateEvent(eventId, data);
    const newKeys = imageKeysOf(data);
    await releaseImages(this.deps, wedding.id, imageKeysOf(event.data).filter((old) => !newKeys.includes(old)));
  }
}

export class DeleteEvent {
  constructor(private deps: Deps) {}

  /** Also deletes the blocks that show just this event, in every website version. */
  async execute(userId: string, weddingId: string, eventId: string): Promise<void> {
    const { wedding, event } = await loadEvent(this.deps, userId, weddingId, eventId);
    await this.deps.weddings.deleteEvent(eventId);
    await releaseImages(this.deps, wedding.id, imageKeysOf(event.data));
  }
}
