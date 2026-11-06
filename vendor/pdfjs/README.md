PDF.js 4.10.38 (`pdf.min.js` and `pdf.worker.min.js`, Apache-2.0, see LICENSE),
from the npm package `pdfjs-dist@4.10.38` (`build/pdf.min.mjs` and
`build/pdf.worker.min.mjs`, renamed to `.js` so any static host serves them as
JavaScript), otherwise unmodified. Self-hosted so the shell loads no
third-party script. Only the owner console loads it, on first use
(`js/pagepic.js`), to make the picture of a PDF's page that the stores see on
their Resources page; the service worker keeps it in the library cache.
