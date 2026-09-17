export type MessageQueue<T> = {
  push(item: T): void;
  close(): void;
  stream: AsyncIterable<T>;
};

export function createMessageQueue<T>(): MessageQueue<T> {
  const buffer: T[] = [];
  let waiting: ((result: IteratorResult<T>) => void) | null = null;
  let closed = false;

  const push = (item: T) => {
    if (closed) return;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value: item, done: false });
      return;
    }
    buffer.push(item);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve({ value: undefined as never, done: true });
    }
  };

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<T>> => {
        const queued = buffer.shift();
        if (queued !== undefined) return Promise.resolve({ value: queued, done: false });
        if (closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => {
          waiting = resolve;
        });
      },
    }),
  };

  return { push, close, stream };
}
