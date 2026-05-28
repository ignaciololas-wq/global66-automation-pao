// Retry wrapper exponencial backoff con jitter.
// Uso: await retry(() => axios.get(url), { retries: 3 })

const DEFAULTS = { retries: 3, minDelay: 500, maxDelay: 8000, factor: 2, jitter: 0.3 };

export async function retry(fn, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let lastErr;
  for (let attempt = 0; attempt <= o.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === o.retries) break;
      if (!isRetriable(e)) throw e;
      const base = Math.min(o.minDelay * Math.pow(o.factor, attempt), o.maxDelay);
      const delay = base * (1 + (Math.random() * 2 - 1) * o.jitter);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function isRetriable(err) {
  const status = err.response?.status ?? err.status ?? null;
  if (status === null) return true;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') return true;
  return false;
}
