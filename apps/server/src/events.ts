// In-process fan-out to server-sent-event subscribers. Events are notifications; the page re-reads state over HTTP.

// catalog.changed and evidence.registered are the lab route group's (src/lab/routes.ts), under Perf Lab's names.
export type EventType = 'hello' | 'ping' | 'job.updated' | 'job.event' | 'records.added' | 'device.updated' | 'host.updated' | 'catalog.changed' | 'evidence.registered';
export interface ServerEvent {
  type: EventType;
  data: unknown;
}
type Listener = (e: ServerEvent) => void;

export class EventBus {
  private readonly listeners = new Set<Listener>();
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(type: EventType, data: unknown): void {
    for (const l of this.listeners) l({ type, data });
  }
  get size(): number {
    return this.listeners.size;
  }
}
