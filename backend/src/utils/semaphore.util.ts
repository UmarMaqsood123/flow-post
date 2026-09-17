/** Limits how many tasks run at once within this process. */
export const createSemaphore = (limit: number) => {
  let active = 0;
  const waiting: (() => void)[] = [];

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < limit) active += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      release();
    }
  };
};
