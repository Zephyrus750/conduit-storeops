// The redrawn chapters, in the order they were redrawn. A chapter that keeps
// Help's id takes that chapter's place; one with a new id (receivephone,
// decantphone) is added.
import { receive } from './receive.js';
import { refresh } from './refresh.js';
import { bfscan } from './bfscan.js';
import { around } from './around.js';
import { decant } from './decant.js';
import { labels } from './labels.js';
import { bfreview } from './bfreview.js';
import { manifests } from './manifests.js';

export const NEW = [receive, refresh, bfscan, around, decant, labels, bfreview, manifests];
