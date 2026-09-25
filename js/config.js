// Where the shell finds the worker when nothing else says. ?worker=<url>
// switches a device (remembered) only to a worker on this list, or to a
// local worker when the shell itself runs on localhost during dev. A link
// cannot point a store device at anyone else's server.
export const WORKER_DEFAULT = 'https://conduit-staging.zephyrus-np750.workers.dev';
// The full map editor stays its own owner tool (it is not part of the store
// app); the console's "Map editor" buttons open it in a new tab. Set this to
// where the editor is hosted, e.g. 'https://<editor site>/editor/editor.html'.
export const MAP_EDITOR_URL = '';

export const WORKER_ALLOWED = [
  'https://conduit-staging.zephyrus-np750.workers.dev',
  'https://conduit.zephyrus-np750.workers.dev',
];
