// A tiny path router. Patterns use :name segments. No dependencies.

export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  // A parameter is one path segment once decoded: an encoded slash,
  // backslash, dot segment or control character in it is refused (`bad`),
  // so `..%2Ftail` cannot walk a forwarded path onto another route.
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      for (const [i, k] of r.keys.entries()) {
        let v; try { v = decodeURIComponent(m[i + 1]); } catch { return { bad: `${k} is not a valid path segment` }; }
        if (!segmentOk(v)) return { bad: `${k} is not a valid path segment` };
        params[k] = v;
      }
      return { handler: r.handler, params };
    }
    return null;
  }
}

export function segmentOk(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && v !== '.' && v !== '..' && !/[\/\\%\u0000-\u001f\u007f]/.test(v);
}
