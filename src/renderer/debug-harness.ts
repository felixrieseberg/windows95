// Autonomous boot probe. Started from emulator.tsx when WIN95_PROBE=1.
// Writes status + screenshot to /tmp so an outer loop can read them
// without DevTools or CDP.

import * as fs from "fs";

const STATUS_FILE = process.env.WIN95_PROBE_STATUS || "/tmp/win95-probe.json";
const SCREEN_FILE = process.env.WIN95_PROBE_SCREEN || "/tmp/win95-screen.png";
const TICK_MS = 5000;

interface ProbeStatus {
  ts: string;
  uptimeSec: number;
  phase: "init" | "running" | "text-mode" | "splash" | "desktop" | "done";
  cpuRunning: boolean;
  instructionCounter: number;
  instructionDelta: number;
  textScreen: string;
  textHash: string;
  gfxW: number;
  gfxH: number;
  dominantColor: string;
  verdict:
    | ""
    | "SUCCESS"
    | "FAIL_IOS"
    | "FAIL_KRNL386"
    | "FAIL_VXDLINK"
    | "FAIL_PROTECTION"
    | "FAIL_SPLASH_HANG"
    | "FAIL_HUNG"
    | "FAIL_OTHER";
}

let startTime = 0;
let lastInstr = 0;
let lastTextHash = "";
let stableTextTicks = 0;

// XT scancodes (set 1). Win95 doesn't have Win+R — that landed in Win98.
// Ctrl+Esc opens Start, then R is the underlined mnemonic for "Run...".
const SC = {
  CTRL_DN: [0x1d],
  CTRL_UP: [0x9d],
  ESC_DN: [0x01],
  ESC_UP: [0x81],
  R_DN: [0x13],
  R_UP: [0x93],
  ENTER_DN: [0x1c],
  ENTER_UP: [0x9c],
  BACKSLASH_DN: [0x2b],
  BACKSLASH_UP: [0xab],
  ALT_DN: [0x38],
  ALT_UP: [0xb8],
};

// WIN95_PROBE_CDTRACE=1 → wrap secondary-IDE ata_command/atapi_handle and
// log every command so we can see whether Win95's ESDI_506/CDVSD stack ever
// talks to the drive (and which ATAPI CDBs it sends).
const CDTRACE_FILE =
  process.env.WIN95_PROBE_CDTRACE_FILE || "/tmp/win95-cdtrace.log";
let cdTraceArmed = false;

function armCdTrace(emulator: any) {
  const dev = emulator.v86?.cpu?.devices;
  if (!dev || cdTraceArmed) return;
  cdTraceArmed = true;
  const sec = dev.ide?.secondary;
  fs.writeFileSync(
    CDTRACE_FILE,
    `[probe] cd buffer=${!!dev.cdrom?.buffer} bytes=${dev.cdrom?.buffer?.byteLength} is_atapi=${sec?.master?.is_atapi}\n`,
  );
  const t0 = Date.now();
  const log = (s: string) =>
    fs.appendFileSync(
      CDTRACE_FILE,
      `[${((Date.now() - t0) / 1000).toFixed(2)}s] ${s}\n`,
    );
  const proto = Object.getPrototypeOf(sec?.master || {});
  for (const m of ["ata_command", "atapi_handle"]) {
    const orig = proto?.[m];
    if (typeof orig !== "function") continue;
    proto[m] = function (this: any, ...a: any[]) {
      if (this === sec?.master || this === sec?.slave) {
        const who = this === sec.master ? "sm" : "ss";
        if (m === "ata_command")
          log(`${who} ata   cmd=0x${(a[0] ?? 0).toString(16)}`);
        else {
          const d = this.data || [];
          const cdb = Array.from(d.slice?.(0, 12) || [])
            .map((b: any) => b.toString(16).padStart(2, "0"))
            .join(" ");
          log(`${who} atapi cmd=0x${(d[0] ?? 0).toString(16)} cdb=[${cdb}]`);
        }
      }
      return orig.apply(this, a);
    };
  }
  console.log("[probe] cd trace armed");
}

// WIN95_PROBE_VGATRACE=1 → wrap VGA I/O ports at the io.ports[] layer (the
// VGAScreen.portXXX_write methods are captured by-value at registration time,
// so monkey-patching them on the instance is a no-op for most ports). Each
// entry is [port, op, value, "eip VMPE cplN"] so you can tell vgabios in V86
// mode apart from the ring-0 display driver.
const VGATRACE_FILE = "/tmp/win95-vgatrace.json";
let vgaTrace: any[] | undefined;

function armVgaTrace(emulator: any) {
  const cpu = emulator.v86?.cpu;
  const io = cpu?.io;
  if (!io || vgaTrace) return;
  vgaTrace = [];
  const ctx = () => {
    try {
      const ip = (cpu.instruction_pointer[0] >>> 0).toString(16);
      const vm = cpu.flags[0] & (1 << 17) ? "VM" : "  ";
      const pe = cpu.cr[0] & 1 ? "PE" : "  ";
      return `${ip} ${vm}${pe} cpl${cpu.cpl[0]}`;
    } catch {
      return "?";
    }
  };
  const W = [
    0x3c0, 0x3c2, 0x3c4, 0x3c5, 0x3ce, 0x3cf, 0x3d4, 0x3d5, 0x3b4, 0x3b5, 0x1ce,
    0x1cf,
  ];
  const R = [0x1cf, 0x3da, 0x3c1];
  for (const p of W)
    for (const w of ["write8", "write16"]) {
      const orig = io.ports[p][w];
      io.ports[p][w] = function (v: number) {
        vgaTrace!.push([p, w, v, ctx()]);
        return orig.call(this, v);
      };
    }
  for (const p of R)
    for (const r of ["read8", "read16"]) {
      const orig = io.ports[p][r];
      io.ports[p][r] = function () {
        const v = orig.call(this);
        vgaTrace!.push([p, r, v, ctx()]);
        return v;
      };
    }
  console.log("[probe] vga trace armed");
}

function dumpVgaTrace(emulator: any) {
  if (!vgaTrace) return;
  const d = emulator.v86?.cpu?.devices?.vga;
  const state = d && {
    svga_enabled: d.svga_enabled,
    graphical_mode: d.graphical_mode,
    attribute_mode: d.attribute_mode,
    miscellaneous_graphics_register: d.miscellaneous_graphics_register,
    sequencer_memory_mode: d.sequencer_memory_mode,
    clocking_mode: d.clocking_mode,
    plane_write_bm: d.plane_write_bm,
    crtc_mode: d.crtc_mode,
    max_scan_line: d.max_scan_line,
    underline_location_register: d.underline_location_register,
    horizontal_display_enable_end: d.horizontal_display_enable_end,
    horizontal_blank_start: d.horizontal_blank_start,
    vertical_display_enable_end: d.vertical_display_enable_end,
    vertical_blank_start: d.vertical_blank_start,
    offset_register: d.offset_register,
    dispi_enable_value: d.dispi_enable_value,
    screen_width: d.screen_width,
    screen_height: d.screen_height,
    max_cols: d.max_cols,
    max_rows: d.max_rows,
  };
  fs.writeFileSync(VGATRACE_FILE, JSON.stringify({ state, trace: vgaTrace }));
}

function sendChord(emu: any, ...keys: { dn: number[]; up: number[] }[]) {
  for (const k of keys) emu.keyboard_send_scancodes(k.dn);
  setTimeout(() => {
    for (let i = keys.length - 1; i >= 0; i--)
      emu.keyboard_send_scancodes(keys[i].up);
  }, 60);
}

function sendKey(emu: any, dn: number[], up: number[]) {
  emu.keyboard_send_scancodes(dn);
  setTimeout(() => emu.keyboard_send_scancodes(up), 50);
}

/** Replay a list of actions: {type:"keys",dn,up} | {type:"text",text} | {type:"wait",ms} */
function runScript(emu: any, steps: any[]) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) {
      console.log("[probe] script done");
      return;
    }
    const s = steps[i++];
    if (s.type === "wait") {
      setTimeout(next, s.ms);
      return;
    }
    if (s.type === "keys") {
      sendKey(emu, s.dn, s.up);
      setTimeout(next, 200);
      return;
    }
    if (s.type === "chord") {
      sendChord(emu, ...s.keys);
      setTimeout(next, 200);
      return;
    }
    if (s.type === "text") {
      // keyboard_send_text handles ASCII → scancode for us
      emu.keyboard_send_text(s.text);
      setTimeout(next, 100 + s.text.length * 30);
      return;
    }
    next();
  };
  next();
}

export function startProbe(emulator: any) {
  startTime = Date.now();
  console.log("[probe] writing to", STATUS_FILE);

  // WIN95_PROBE_SCRIPT=\\HOST  → after desktop, send Win+R, type, Enter
  const scriptCmd = process.env.WIN95_PROBE_SCRIPT;
  // WIN95_PROBE_RUN='telnet 1.2.3.4 7777' → literal text into Start→Run,
  // Enter, then optional WIN95_PROBE_RUN_AFTER keystrokes after _RUN_WAIT ms.
  // WIN95_PROBE_RUN2 fires a second Start→Run sequence after _RUN2_WAIT ms,
  // for two-process scenarios (e.g., background ping + telnet).
  const runCmd = process.env.WIN95_PROBE_RUN;
  const runCmd2 = process.env.WIN95_PROBE_RUN2;
  const runAfter = process.env.WIN95_PROBE_RUN_AFTER;
  // WIN95_PROBE_DOSBOX=1 → after desktop, open COMMAND.COM, type `dir`,
  // optionally Alt+Enter to fullscreen. Regression test for the windowed
  // DOS box clobbering VBE (felixrieseberg/v86 vga-defer-vbe-disable-v86).
  const dosBox = process.env.WIN95_PROBE_DOSBOX === "1";
  const wantVgaTrace = process.env.WIN95_PROBE_VGATRACE === "1";
  const wantCdTrace = process.env.WIN95_PROBE_CDTRACE === "1";
  let scriptArmed = !!scriptCmd || !!runCmd || dosBox;

  const tick = () => {
    try {
      if (wantVgaTrace && !vgaTrace) armVgaTrace(emulator);
      if (wantCdTrace && !cdTraceArmed) armCdTrace(emulator);
      const s = collectStatus(emulator);
      fs.writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2));

      // Try to capture a screenshot — this can fail if the screen adapter
      // isn't ready yet, so we swallow that.
      try {
        // rAF doesn't fire when the Electron window is occluded, so the
        // screen adapter's render loop stalls. Pump one frame by hand.
        try {
          emulator.screen_adapter?.update_screen?.();
        } catch {}
        const img: HTMLImageElement = emulator.screen_make_screenshot();
        // The Image has a data: URL src; decode it to bytes
        if (img && img.src && img.src.startsWith("data:image/png;base64,")) {
          const b64 = img.src.slice("data:image/png;base64,".length);
          fs.writeFileSync(SCREEN_FILE, Buffer.from(b64, "base64"));
        }
      } catch {}

      dumpVgaTrace(emulator);

      // Once at desktop, fire the keyboard script (once). The 8s settle is
      // for the "Welcome to Windows 95" tip dialog to be dismissable —
      // we send Esc first to clear it.
      if (scriptArmed && s.phase === "desktop" && s.uptimeSec > 8) {
        scriptArmed = false;
        if (dosBox) {
          console.log("[probe] desktop detected, opening DOS box");
          runScript(emulator, [
            { type: "wait", ms: 3000 },
            { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP },
            { type: "wait", ms: 1000 },
            { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP },
            { type: "wait", ms: 1000 },
            {
              type: "chord",
              keys: [
                { dn: SC.CTRL_DN, up: SC.CTRL_UP },
                { dn: SC.ESC_DN, up: SC.ESC_UP },
              ],
            },
            { type: "wait", ms: 1200 },
            { type: "keys", dn: SC.R_DN, up: SC.R_UP },
            { type: "wait", ms: 1000 },
            { type: "text", text: "command" },
            { type: "wait", ms: 400 },
            { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
            { type: "wait", ms: 5000 },
            { type: "text", text: "dir" },
            { type: "wait", ms: 200 },
            { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
            { type: "wait", ms: 3000 },
            ...(process.env.WIN95_PROBE_DOSBOX_ALTENTER === "1"
              ? [
                  {
                    type: "chord",
                    keys: [
                      { dn: SC.ALT_DN, up: SC.ALT_UP },
                      { dn: SC.ENTER_DN, up: SC.ENTER_UP },
                    ],
                  },
                  { type: "wait", ms: 4000 },
                ]
              : []),
          ]);
          return;
        }
        if (runCmd) {
          console.log("[probe] desktop detected, Run →", runCmd);
          runScript(emulator, [
            { type: "wait", ms: 3000 },
            { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP },
            { type: "wait", ms: 1000 },
            { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP },
            { type: "wait", ms: 1000 },
            {
              type: "chord",
              keys: [
                { dn: SC.CTRL_DN, up: SC.CTRL_UP },
                { dn: SC.ESC_DN, up: SC.ESC_UP },
              ],
            },
            { type: "wait", ms: 1200 },
            { type: "keys", dn: SC.R_DN, up: SC.R_UP },
            { type: "wait", ms: 1000 },
            { type: "text", text: runCmd },
            { type: "wait", ms: 400 },
            { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
            ...(runCmd2
              ? [
                  {
                    type: "wait",
                    ms: Number(process.env.WIN95_PROBE_RUN2_WAIT) || 3000,
                  },
                  {
                    type: "chord",
                    keys: [
                      { dn: SC.CTRL_DN, up: SC.CTRL_UP },
                      { dn: SC.ESC_DN, up: SC.ESC_UP },
                    ],
                  },
                  { type: "wait", ms: 1200 },
                  { type: "keys", dn: SC.R_DN, up: SC.R_UP },
                  { type: "wait", ms: 1000 },
                  { type: "text", text: runCmd2 },
                  { type: "wait", ms: 400 },
                  { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
                ]
              : []),
            ...(runAfter
              ? [
                  {
                    type: "wait",
                    ms: Number(process.env.WIN95_PROBE_RUN_WAIT) || 6000,
                  },
                  { type: "text", text: runAfter },
                  { type: "wait", ms: 200 },
                  { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
                ]
              : []),
          ]);
          return;
        }
        console.log("[probe] desktop detected, running script:", scriptCmd);
        runScript(emulator, [
          { type: "wait", ms: 3000 },
          { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP }, // dismiss any dialog
          { type: "wait", ms: 1000 },
          { type: "keys", dn: SC.ESC_DN, up: SC.ESC_UP }, // again, for safety
          { type: "wait", ms: 1000 },
          {
            type: "chord",
            keys: [
              { dn: SC.CTRL_DN, up: SC.CTRL_UP },
              { dn: SC.ESC_DN, up: SC.ESC_UP },
            ],
          }, // Ctrl+Esc → Start
          { type: "wait", ms: 1200 },
          { type: "keys", dn: SC.R_DN, up: SC.R_UP }, // Run mnemonic
          { type: "wait", ms: 1000 },
          // keyboard_send_text can't reliably do backslash, so we interleave:
          // scancode for each \ segment, text for each name segment.
          // WIN95_PROBE_SCRIPT='HOST/HOST' → types \\HOST\HOST (we use / as
          // the segment separator in the env var to dodge shell escaping hell)
          ...scriptCmd!.split("/").flatMap((seg, i) => [
            ...(i === 0
              ? [
                  { type: "keys", dn: SC.BACKSLASH_DN, up: SC.BACKSLASH_UP },
                  { type: "wait", ms: 60 },
                  { type: "keys", dn: SC.BACKSLASH_DN, up: SC.BACKSLASH_UP },
                ]
              : [{ type: "keys", dn: SC.BACKSLASH_DN, up: SC.BACKSLASH_UP }]),
            { type: "wait", ms: 60 },
            { type: "text", text: seg },
            { type: "wait", ms: 100 },
          ]),
          { type: "wait", ms: 400 },
          { type: "keys", dn: SC.ENTER_DN, up: SC.ENTER_UP },
        ]);
      }

      if (s.verdict) {
        console.log("[probe] VERDICT:", s.verdict);
        fs.writeFileSync(STATUS_FILE.replace(".json", ".done"), s.verdict);
      }
    } catch (e) {
      console.log("[probe] tick error:", e);
    }
  };

  tick();
  setInterval(tick, TICK_MS);
}

function collectStatus(emulator: any): ProbeStatus {
  const uptimeSec = (Date.now() - startTime) / 1000;

  // CPU activity — instruction counter is u32 in wasm, wraps every ~4B
  let instr = 0,
    running = false;
  try {
    instr = emulator.get_instruction_counter() || 0;
  } catch {}
  try {
    running = emulator.is_running();
  } catch {}
  const instrDelta = (instr - lastInstr) >>> 0;
  lastInstr = instr;

  // Text screen — only meaningful in text mode (BIOS, DOS, BSOD).
  // In graphics mode this returns garbage or empty.
  let textScreen = "";
  try {
    const screen = emulator.screen_adapter || emulator.v86?.screen_adapter;
    if (screen) {
      const rows = screen.get_text_screen?.() || [];
      textScreen = rows
        .map((r: string) => r.trimEnd())
        .join("\n")
        .trim();
    }
  } catch {}

  // VGA state tells us everything: in graphics or text, and at what resolution.
  // Win95 splash: 320×400. Win95 desktop: ≥640×480.
  // Old v86 builds (pre-2025) don't expose screen_width/screen_height — fall
  // back to the rendered canvas dimensions so the bisect harness works across
  // versions.
  let inGraphics = false,
    gfxW = 0,
    gfxH = 0;
  try {
    const vga = emulator.v86?.cpu?.devices?.vga;
    if (vga) {
      inGraphics = !!vga.graphical_mode;
      gfxW = vga.screen_width || 0;
      gfxH = vga.screen_height || 0;
    }
  } catch {}
  if (gfxW === 0) {
    try {
      const canvas = document.querySelector(
        "#emulator canvas",
      ) as HTMLCanvasElement | null;
      if (canvas && canvas.width > 0) {
        gfxW = canvas.width;
        gfxH = canvas.height;
        // Canvas exists with content → assume graphics. Text mode uses a div.
        const textDiv = document.querySelector(
          "#emulator div",
        ) as HTMLElement | null;
        inGraphics =
          canvas.style.display !== "none" &&
          (!textDiv || textDiv.style.display === "none");
      }
    } catch {}
  }

  // Sample the framebuffer to identify which screen we're on.
  // Splash is sky-blue gradient (R~120 G~175 B~215). Desktop is teal (0,128,128).
  let dominantColor = "";
  if (inGraphics) {
    try {
      const canvas = document.querySelector(
        "#emulator canvas",
      ) as HTMLCanvasElement | null;
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        const cx = Math.floor(canvas.width / 2);
        const cy = Math.floor(canvas.height / 3); // upper-third → sky on splash, taskbar-free on desktop
        const px = ctx.getImageData(cx, cy, 1, 1).data;
        dominantColor = `${px[0]},${px[1]},${px[2]}`;
      }
    } catch {}
  }

  const textHash = hashStr(textScreen);
  if (!inGraphics && textHash === lastTextHash && textScreen) stableTextTicks++;
  else stableTextTicks = 0;
  lastTextHash = textHash;

  const hasMeaningfulText =
    !inGraphics && textScreen.length > 20 && /[A-Za-z]{4,}/.test(textScreen);
  const atSplash = inGraphics && gfxW > 0 && gfxW < 640;
  const atDesktop = inGraphics && gfxW >= 640;

  const phase: ProbeStatus["phase"] = !running
    ? "init"
    : atDesktop
      ? "desktop"
      : atSplash
        ? "splash"
        : hasMeaningfulText
          ? "text-mode"
          : "running";

  let verdict: ProbeStatus["verdict"] = "";
  const t = inGraphics ? "" : textScreen.toLowerCase();

  if (t.includes("krnl386")) verdict = "FAIL_KRNL386";
  else if (t.includes("vxd dynamic link")) verdict = "FAIL_VXDLINK";
  else if (
    t.includes("initializing device ios") &&
    t.includes("protection error")
  )
    verdict = "FAIL_IOS";
  else if (t.includes("windows protection error")) verdict = "FAIL_PROTECTION";
  // Stuck at splash for >70s with CPU spinning → IDE IRQ never fired
  else if (atSplash && uptimeSec > 70) verdict = "FAIL_SPLASH_HANG";
  // Stuck on text for 40s
  else if (stableTextTicks >= 8 && instrDelta > 1_000_000)
    verdict = "FAIL_HUNG";
  // CPU dead
  else if (running && instrDelta < 1000 && uptimeSec > 30)
    verdict = "FAIL_HUNG";
  // Made it to ≥640×480 graphics → desktop reached. But if a keyboard
  // script is running, hold off — the outer harness reads the SMB log
  // directly and we just keep the app alive.
  else if (
    atDesktop &&
    uptimeSec > 30 &&
    !process.env.WIN95_PROBE_SCRIPT &&
    !process.env.WIN95_PROBE_RUN &&
    !process.env.WIN95_PROBE_DOSBOX
  )
    verdict = "SUCCESS";
  // Timeout
  else if (uptimeSec > 180) verdict = "FAIL_OTHER";

  return {
    ts: new Date().toISOString(),
    uptimeSec: Math.round(uptimeSec),
    phase,
    cpuRunning: running,
    instructionCounter: instr,
    instructionDelta: instrDelta,
    textScreen: textScreen.slice(0, 2000),
    textHash,
    gfxW,
    gfxH,
    dominantColor,
    verdict,
  };
}

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
