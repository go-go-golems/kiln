export interface ServerEvent {
  type: 'job.updated' | 'job.event' | 'artifact.imported' | 'catalog.changed' | 'evidence.registered' | 'dataset.progress' | 'dataset.materialized';
  data: unknown;
}

type Listener = (e: ServerEvent) => void;

/** In-process fan-out to SSE subscribers. Events are notifications; state is always re-read over HTTP. */
export class EventBus {
  private readonly listeners = new Set<Listener>();
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(type: ServerEvent['type'], data: unknown) {
    for (const l of this.listeners) l({ type, data });
  }
  get size() {
    return this.listeners.size;
  }
}
