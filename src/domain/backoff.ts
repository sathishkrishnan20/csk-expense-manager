// Tries `work` again after a pause that doubles each time (base, 2 x base, 4 x base, ...), so a slow or briefly missing connection
// gets a chance to recover before anyone is told about it. `attempts` counts the first try. An error `retryIf` rejects (a wrong link
// will not get better by waiting) is thrown at once; the last error is thrown when the tries run out. `sleep` can be replaced in tests.
export interface BackoffOptions {
  attempts: number;
  baseDelayMs: number;
  retryIf?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withBackoff<T>(work: () => Promise<T>, { attempts, baseDelayMs, retryIf = () => true, sleep = wait }: BackoffOptions): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await work();
    } catch (err) {
      if (attempt >= attempts || !retryIf(err)) throw err;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
