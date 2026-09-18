// Where the shell finds the worker when nothing else says. Overridden by
// ?worker=<url> once per device (remembered) and by localhost during dev.
export const WORKER_DEFAULT = 'https://conduit-staging.zephyrus-np750.workers.dev';
