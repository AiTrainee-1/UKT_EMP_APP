// One full-screen popup at a time, opened from anywhere (a hook, the middle of an async flow) and drawn by ONE host
// component mounted at the app root (owner 2026-11-25: the logout confirmation, the "location is off" popup and the
// sign-in / sign-out transitions all work this way). Pure: no React Native, tested in overlayStore.test.ts.
//
//   const store = createOverlayStore<Request, Answer>(answerWhenDismissed);
//   const answer = await store.open(request);   // a flow waits for what the person chose
//   store.answer(value);                        // the host, when a button is pressed
//   useSyncExternalStore(store.subscribe, store.get)  // the host reads what to draw

export interface OverlayState<Req> {
  /** New each time it opens (a host can restart its entrance animation on a new id). */
  id: number;
  request: Req;
}

export interface OverlayStore<Req, Res> {
  /** What is open now, or null. The same object until it changes (safe for useSyncExternalStore). */
  get(): OverlayState<Req> | null;
  subscribe(listener: () => void): () => void;
  /** Opens it. Something already open is answered with the "dismissed" answer first. */
  open(request: Req): Promise<Res>;
  /** Changes what the open one shows (same id); nothing when it is closed. */
  update(request: Req): void;
  /** Closes it with this answer (resolves the waiting `open`). Nothing when it is closed. */
  answer(result: Res): void;
  /** Closes it with the "dismissed" answer. */
  dismiss(): void;
}

let nextId = 0;

export function createOverlayStore<Req, Res>(dismissed: Res): OverlayStore<Req, Res> {
  let state: OverlayState<Req> | null = null;
  let resolve: ((r: Res) => void) | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const close = (result: Res) => {
    if (!state) return;
    const done = resolve;
    state = null;
    resolve = null;
    emit();
    done?.(result);
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open(request) {
      if (state) close(dismissed);
      return new Promise<Res>((r) => {
        nextId += 1;
        state = { id: nextId, request };
        resolve = r;
        emit();
      });
    },
    update(request) {
      if (!state) return;
      state = { id: state.id, request };
      emit();
    },
    answer: close,
    dismiss: () => close(dismissed),
  };
}
