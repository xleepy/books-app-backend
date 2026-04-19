const DELAY_MS = Math.ceil(1000 / 3); // ~334ms = 3 req/s

export function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export async function rateLimitedFetch(
  url: string,
  retries = 5
): Promise<Response> {
  await sleep(DELAY_MS);

  const res = await fetch(url, {
    headers: { "User-Agent": "BooksApp/1.0 (seed-script)" },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get("Retry-After") ?? "30", 10);
    console.warn(`  429 rate limit on ${url}, waiting ${retryAfter}s...`);
    await sleep(retryAfter * 1000);
    return rateLimitedFetch(url, retries - 1);
  }

  return res;
}
