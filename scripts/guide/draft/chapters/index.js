// The redrawn chapters, in the order they were redrawn. A chapter that keeps
// Help's id takes that chapter's place; one with a new id (receivephone) is
// added. replaces: <Help's id> swaps a chapter under a new id.
import { receive } from './receive.js';
import { refresh } from './refresh.js';
import { bfscan } from './bfscan.js';
import { around } from './around.js';

export const NEW = [receive, refresh, bfscan, around];
