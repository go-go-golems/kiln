// The eval worker's entry point (bundled into src/frame.gen.js as WORKER_JS). The sandbox frame starts it from a
// blob: URL and transfers it the page's port. Eval code runs here, in a realm with no document: nothing to navigate,
// no window to open, no DOM, and every request it can make (fetch, WebSocket, importScripts, a nested worker) is
// governed by the CSP it inherits from the frame. The first message's port is its only channel.
import { startFrame } from "./frame.js";

addEventListener("message", (e) => { if (e.ports?.[0]) startFrame(e.ports[0]); }, { once: true });
