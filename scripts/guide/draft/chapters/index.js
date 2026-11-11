// The chapters being drawn. A chapter that keeps Help's id takes that
// chapter's place; one with a new id is added. Add each draft here:
//   import { name } from './name.js';  →  export const NEW = [name];
// Off-site and diverted trucks, and the manifest preview's views: Manifests
// (the preview redrawn, and two Planner What ifs), Receiving on the PC and
// on the phone (Send to off-site, from the desk and a manager's phone).
import { manifests } from './manifests.js';
import { receivepc } from './receivepc.js';
import { receive } from './receive.js';
export const NEW = [manifests, receivepc, receive];
