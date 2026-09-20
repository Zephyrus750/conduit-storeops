// Calls to the other workers on the account (the legacy suite worker and
// the details worker) go through service bindings when they are bound:
// a Worker fetching another Worker's workers.dev URL on the same account is
// refused by Cloudflare (error 1042), and a binding is also the faster
// path. Without a binding (local dev, tests) it is a plain fetch.
export function upstream(env, binding, fetchImpl = fetch) {
  const svc = env?.[binding];
  return (url, init) => (svc && typeof svc.fetch === 'function' ? svc.fetch(url, init) : fetchImpl(url, init));
}
