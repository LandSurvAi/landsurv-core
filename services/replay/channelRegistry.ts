/**
 * Runtime replay channel registry.
 *
 * Providers and components register a channel with its serialized definition
 * and an apply callback. The playback driver resolves a channel map from the
 * seek index and applies only channels that changed. Registration is a no-op
 * outside playback; live capture remains on the existing recorder path.
 */

import type {
  JsonValue,
  ReplayChannelDefinition,
} from '../../utils/recording/v2';
import type { ReplayChannelMap } from '../../utils/recording/seek';
import { CRITICAL_REPLAY_CHANNELS } from '../../utils/recording/channels';
import { stableStringify } from '../../utils/recording/stable';

interface RegisteredChannel {
  definition: ReplayChannelDefinition<unknown>;
  read: () => unknown;
  apply: (value: unknown) => void;
}

export interface ApplyChannelsResult {
  applied: number;
  skipped: number;
  missing: string[];
}

export class ReplayChannelRegistry {
  private readonly channels = new Map<string, RegisteredChannel>();
  private readonly lastApplied = new Map<string, string>();
  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  register<T>(
    definition: ReplayChannelDefinition<T>,
    read: () => T,
    apply: (value: T) => void,
  ): () => void {
    this.channels.set(definition.id, {
      definition: definition as unknown as ReplayChannelDefinition<unknown>,
      read: read as () => unknown,
      apply: apply as (value: unknown) => void,
    });
    this.notify();
    return () => {
      if (this.channels.get(definition.id)?.definition === definition as unknown) {
        this.channels.delete(definition.id);
        this.notify();
      }
    };
  }

  has(id: string): boolean {
    return this.channels.has(id);
  }

  registeredIds(): string[] {
    return [...this.channels.keys()];
  }

  missingCritical(): string[] {
    return CRITICAL_REPLAY_CHANNELS.filter(id => !this.channels.has(id));
  }

  snapshot(): ReplayChannelMap {
    const result: ReplayChannelMap = {};
    for (const [id, registration] of this.channels) {
      if (!registration.definition.serialize) continue;
      try {
        result[id] = registration.definition.serialize(registration.read());
      } catch {
        // A channel that cannot serialize is simply absent from capture.
      }
    }
    return result;
  }

  applyAll(
    channels: ReplayChannelMap,
    options: { force?: boolean } = {},
  ): ApplyChannelsResult {
    let applied = 0;
    let skipped = 0;
    const missing: string[] = [];

    for (const [id, value] of Object.entries(channels)) {
      const registration = this.channels.get(id);
      if (!registration) {
        missing.push(id);
        continue;
      }

      const serialized = stableStringify(value);
      if (!options.force && this.lastApplied.get(id) === serialized) {
        skipped += 1;
        continue;
      }

      const next = registration.definition.deserialize
        ? registration.definition.deserialize(value)
        : value;
      registration.apply(next);
      this.lastApplied.set(id, serialized);
      applied += 1;
    }

    return { applied, skipped, missing };
  }

  resetAppliedState(): void {
    this.lastApplied.clear();
  }
}
