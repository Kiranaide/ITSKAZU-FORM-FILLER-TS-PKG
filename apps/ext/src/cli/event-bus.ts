type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Handler<Events[keyof Events]>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler as Handler<Events[keyof Events]>);
    this.listeners.set(type, set);
    return () => set.delete(handler as Handler<Events[keyof Events]>);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const handler of this.listeners.get(type) ?? []) {
      (handler as Handler<Events[K]>)(payload);
    }
  }
}
