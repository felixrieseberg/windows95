// Bidirectional text clipboard between the host and the Win95 guest.
//
// Transport is the legacy VMware backdoor clipboard protocol (port 0x5658,
// commands 6–9) implemented in v86's vmware.js. Inside the guest, W95TOOLS.EXE
// (guest-tools/agent) polls the backdoor and bridges it to CF_TEXT via the
// Win32 clipboard-viewer chain. Out here we poll Electron's clipboard — there
// is no change event — and translate between host UTF-8/LF and guest
// Windows-1252/CRLF.

import { clipboard } from "electron";

const CP1252 = new TextDecoder("windows-1252");
// v86's vmware.js and the guest agent both clamp to 64 KB; clamp here too so
// a huge host clipboard never even gets allocated/encoded.
const CLIP_MAX = 0x10000;

function fromGuest(bytes: Uint8Array): string {
  return CP1252.decode(bytes).replace(/\r\n/g, "\n");
}

function toGuest(text: string): Uint8Array {
  const s = text.slice(0, CLIP_MAX).replace(/\r\n|\n/g, "\r\n");
  const n = Math.min(s.length, CLIP_MAX);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 0x3f;
  }
  return out;
}

export function setupClipboardSync(emulator: any): () => void {
  // Track the last value seen on each side so a value we just wrote doesn't
  // bounce back as a "change" from the other side.
  let lastHost = clipboard.readText();
  let lastGuest = "";

  emulator.add_listener("vmware-clipboard-guest", (bytes: Uint8Array) => {
    const text = fromGuest(bytes);
    if (text === lastHost || text === lastGuest) return;
    lastGuest = text;
    lastHost = text;
    clipboard.writeText(text);
    console.log("[clip] guest → host", text.length, "chars");
  });

  const poll = () => {
    const text = clipboard.readText();
    if (text === lastHost) return;
    lastHost = text;
    if (text === lastGuest) return;
    emulator.bus.send("vmware-clipboard-host", toGuest(text));
    console.log("[clip] host → guest", text.length, "chars");
  };

  const id = window.setInterval(poll, 500);
  window.addEventListener("focus", poll);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("focus", poll);
  };
}
