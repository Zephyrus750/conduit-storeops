SheetJS Community Edition 0.18.5 (`xlsx.full.min.js`, Apache-2.0, see LICENSE),
from the npm package `xlsx@0.18.5`, unmodified. Self-hosted so manifest upload
works offline and the shell loads no third-party script. The back dock loads
it on first use (`js/views/backdock/common.js`); the service worker keeps it
in the release cache after that.
