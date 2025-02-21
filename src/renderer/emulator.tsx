import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { ipcRenderer, shell, webUtils } from "electron";

import { CONSTANTS, IPC_COMMANDS } from "../constants";
import { getDiskImageSize } from "../utils/disk-image-size";
import { CardStart } from "./card-start";
import { StartMenu } from "./start-menu";
import { CardSettings } from "./card-settings";
import { EmulatorInfo } from "./emulator-info";
import { getStatePath } from "./utils/get-state-path";
import { Win95Window } from "./app";
import { resetState } from "./utils/reset-state";

declare let window: Win95Window;

export interface EmulatorState {
  currentUiCard: "start" | "settings";
  emulator?: any;
  scale: number;
  floppyFile?: File;
  cdromFile?: File;
  isBootingFresh: boolean;
  isCursorCaptured: boolean;
  isInfoDisplayed: boolean;
  isRunning: boolean;
}

export class Emulator extends React.Component<{}, EmulatorState> {
  private isQuitting = false;
  private isResetting = false;

  constructor(props: {}) {
    super(props);

    this.startEmulator = this.startEmulator.bind(this);
    this.stopEmulator = this.stopEmulator.bind(this);
    this.restartEmulator = this.restartEmulator.bind(this);
    this.resetEmulator = this.resetEmulator.bind(this);
    this.bootFromScratch = this.bootFromScratch.bind(this);

    this.state = {
      isBootingFresh: false,
      isCursorCaptured: false,
      isRunning: false,
      currentUiCard: "start",
      isInfoDisplayed: true,
      // We can start pretty large
      // If it's too large, it'll just grow until it hits borders
      scale: 2,
    };

    this.setupInputListeners();
    this.setupIpcListeners();
    this.setupUnloadListeners();
  }

  /**
   * We want to capture and release the mouse at appropriate times.
   */
  public setupInputListeners() {
    // ESC
    document.onkeydown = (evt) => {
      const { isCursorCaptured } = this.state;

      evt = evt || window.event;

      if (evt.keyCode === 27) {
        if (isCursorCaptured) {
          this.unlockMouse();
        } else {
          this.lockMouse();
        }

        evt.stopPropagation();
      }
    };

    // Click
    document.addEventListener("click", () => {
      const { isRunning } = this.state;

      if (isRunning) {
        this.lockMouse();
      }
    });
  }

  /**
   * Save the emulator's state to disk during exit.
   */
  public setupUnloadListeners() {
    const handleClose = async () => {
      await this.saveState();

      console.log(`Unload: Now done, quitting again.`);
      this.isQuitting = true;

      setImmediate(() => {
        ipcRenderer.invoke(IPC_COMMANDS.APP_QUIT);
      });
    };

    window.onbeforeunload = (event: Event) => {
      if (this.isQuitting || this.isResetting) {
        console.log(`Unload: Not preventing`);
        return;
      }

      console.log(`Unload: Preventing to first save state`);

      handleClose();
      event.preventDefault();
      event.returnValue = false;
    };
  }

  /**
   * Setup the various IPC messages sent to the renderer
   * from the main process
   */
  public setupIpcListeners() {
    ipcRenderer.on(IPC_COMMANDS.MACHINE_CTRL_ALT_DEL, () => {
      this.sendKeys([
        0x1d, // ctrl
        0x38, // alt
        0x53, // delete
      ]);
    });

    ipcRenderer.on(IPC_COMMANDS.MACHINE_ALT_F4, () => {
      this.sendKeys([
        0x38, // alt
        0x3e, // f4
      ]);
    });

    ipcRenderer.on(IPC_COMMANDS.MACHINE_ALT_ENTER, () => {
      this.sendKeys([
        0x38, // alt
        0, // enter
      ]);
    });

    ipcRenderer.on(IPC_COMMANDS.MACHINE_ESC, () => {
      this.sendKeys([
        0x18, // alt
      ]);
    });

    ipcRenderer.on(IPC_COMMANDS.MACHINE_STOP, this.stopEmulator);
    ipcRenderer.on(IPC_COMMANDS.MACHINE_RESET, this.resetEmulator);
    ipcRenderer.on(IPC_COMMANDS.MACHINE_START, this.startEmulator);
    ipcRenderer.on(IPC_COMMANDS.MACHINE_RESTART, this.restartEmulator);

    ipcRenderer.on(IPC_COMMANDS.TOGGLE_INFO, () => {
      this.setState({ isInfoDisplayed: !this.state.isInfoDisplayed });
    });

    ipcRenderer.on(IPC_COMMANDS.SHOW_DISK_IMAGE, () => {
      this.showDiskImage();
    });

    ipcRenderer.on(IPC_COMMANDS.ZOOM_IN, () => {
      this.setScale(this.state.scale * 1.2);
    });

    ipcRenderer.on(IPC_COMMANDS.ZOOM_OUT, () => {
      this.setScale(this.state.scale * 0.8);
    });

    ipcRenderer.on(IPC_COMMANDS.ZOOM_RESET, () => {
      this.setScale(1);
    });
  }

  /**
   * If the emulator isn't running, this is rendering the, erm, UI.
   *
   * 🤡
   */
  public renderUI() {
    const { isRunning, currentUiCard, floppyFile, cdromFile } = this.state;

    if (isRunning) {
      return null;
    }

    let card;

    if (currentUiCard === "settings") {
      card = (
        <CardSettings
          setFloppy={(floppyFile) => this.setState({ floppyFile })}
          setCdrom={(cdromFile) => this.setState({ cdromFile })}
          bootFromScratch={this.bootFromScratch}
          floppy={floppyFile}
          cdrom={cdromFile}
        />
      );
    } else {
      card = <CardStart startEmulator={this.startEmulator} />;
    }

    return (
      <>
        {card}
        <StartMenu
          navigate={(target) => this.setState({ currentUiCard: target as "start" | "settings" })}
        />
      </>
    );
  }

  /**
   * Yaknow, render things and stuff.
   */
  public render() {
    return (
      <>
        {this.renderInfo()}
        {this.renderUI()}
        <div id="emulator">
          <div id="emulator-text-screen"></div>
          <canvas id="emulator-canvas"></canvas>
        </div>
      </>
    );
  }

  /**
   * Render the little info thingy
   */
  public renderInfo() {
    if (!this.state.isInfoDisplayed) {
      return null;
    }

    return (
      <EmulatorInfo
        emulator={this.state.emulator}
        toggleInfo={() => {
          this.setState({ isInfoDisplayed: !this.state.isInfoDisplayed });
        }}
      />
    );
  }

  /**
   * Boot the emulator without restoring state
   */
  public bootFromScratch() {
    this.setState({ isBootingFresh: true });
    this.startEmulator();
  }

  /**
   * Show the disk image on disk
   */
  public showDiskImage() {
    // Contents/Resources/app/dist/static
    console.log(`Showing disk image in ${CONSTANTS.IMAGE_PATH}`);

    shell.showItemInFolder(CONSTANTS.IMAGE_PATH);
  }

  /**
   * Start the actual emulator
   */
  private async startEmulator() {
    document.body.classList.remove("paused");

    const cdromPath = this.state.cdromFile
      ? webUtils.getPathForFile(this.state.cdromFile)
      : null;

    const options = {
      wasm_path: path.join(__dirname, "build/v86.wasm"),
      memory_size: 128 * 1024 * 1024,
      vga_memory_size: 64 * 1024 * 1024,
      screen: {
        container: document.getElementById("emulator"),
        scale: 0
      },
      preserve_mac_from_state_image: true,
      net_device: {
        relay_url: "fetch",
        type: "ne2k",
      },
      bios: {
        url: path.join(__dirname, "../../bios/seabios.bin"),
      },
      vga_bios: {
        url: path.join(__dirname, "../../bios/vgabios.bin"),
      },
      hda: {
        url: CONSTANTS.IMAGE_PATH,
        async: true,
        size: await getDiskImageSize(CONSTANTS.IMAGE_PATH),
      },
      fda: this.state.floppyFile
        ? {
            buffer: this.state.floppyFile,
          }
        : undefined,
      cdrom: cdromPath
        ? {
            url: cdromPath,
            async: true,
            size: await getDiskImageSize(cdromPath),
          }
        : undefined,
      boot_order: 0x132,
    };

    console.log(`🚜 Starting emulator with options`, options);

    window["emulator"] = new V86(options);

    // New v86 instance
    this.setState({
      emulator: window["emulator"],
      isRunning: true,
    });

    ipcRenderer.send(IPC_COMMANDS.MACHINE_STARTED);

    // Restore state. We can't do this right away
    // and randomly chose 500ms as the appropriate
    // wait time (lol)
    setTimeout(async () => {
      if (!this.state.isBootingFresh) {
        this.restoreState();
      }

      this.lockMouse();
      this.state.emulator.run();
      this.state.emulator.screen_set_scale(this.state.scale);
    }, 500);
  }

  /**
   * Restart emulator
   */
  private restartEmulator() {
    if (this.state.emulator && this.state.isRunning) {
      console.log(`🚜 Restarting emulator`);
      this.state.emulator.restart();
    } else {
      console.log(`🚜 Restarting emulator failed: Emulator not running`);
    }
  }

  /**
   * Stop the emulator
   */
  private async stopEmulator() {
    const { emulator, isRunning } = this.state;

    if (!emulator || !isRunning) {
      return;
    }

    console.log(`🚜 Stopping emulator`);

    await this.saveState();
    this.unlockMouse();
    await emulator.stop();
    this.setState({ isRunning: false });
    this.resetCanvas();

    document.body.classList.add("paused");
    ipcRenderer.send(IPC_COMMANDS.MACHINE_STOPPED);
  }

  /**
   * Reset the emulator by reloading the whole page
   */
  private async resetEmulator() {
    this.isResetting = true;

    await this.stopEmulator();
    await resetState();

    document.location.reload();
  }

  /**
   * Take the emulators state and write it to disk. This is possibly
   * a fairly big file.
   */
  private async saveState(): Promise<void> {
    const { emulator } = this.state;
    const statePath = await getStatePath();

    if (!emulator || !emulator.save_state) {
      console.log(`restoreState: No emulator present`);
      return;
    }

    try {
      const newState = await emulator.save_state();
      await fs.promises.writeFile(statePath, Buffer.from(newState), {
        flush: true
      });
    } catch (error) {
      console.warn(`saveState: Could not save state`, error);
    }
  }

  /**
   * Restores state to the emulator.
   */
  private async restoreState() {
    const { emulator, isBootingFresh } = this.state;
    const state = await this.getState();

    if (isBootingFresh) {
      console.log(`restoreState: Booting fresh, not restoring.`);
      return;
    } else if (!state) {
      console.log(`restoreState: No state present, not restoring.`);
      return;
    } else if (!emulator) {
      console.log(`restoreState: No emulator present`);
      return;
    }

    try {
      await this.state.emulator.restore_state(state);
    } catch (error) {
      console.log(
        `restoreState: Could not read state file. Maybe none exists?`,
        error,
      );
    }
  }

  /**
   * Returns the current machine's state - either what
   * we have saved or alternatively the default state.
   *
   * @returns {ArrayBuffer}
   */
  private async getState(): Promise<ArrayBuffer | null> {
    const expectedStatePath = await getStatePath();
    const statePath = fs.existsSync(expectedStatePath)
      ? expectedStatePath
      : CONSTANTS.DEFAULT_STATE_PATH;

    if (fs.existsSync(statePath)) {
      return fs.readFileSync(statePath).buffer;
    } else {
      console.log(`getState: No state file found at ${statePath}`);
    }

    return null;
  }

  private unlockMouse() {
    const { emulator } = this.state;

    this.setState({ isCursorCaptured: false });

    if (emulator) {
      emulator.mouse_set_status(false);
    }

    document.exitPointerLock();
  }

  private lockMouse() {
    const { emulator } = this.state;

    if (emulator) {
      this.setState({ isCursorCaptured: true });
      emulator.mouse_set_status(true);
      emulator.lock_mouse();
    } else {
      console.warn(
        `Emulator: Tried to lock mouse, but no emulator or not running`,
      );
    }
  }

  /**
   * Set the emulator's scale
   *
   * @param target
   */
  private setScale(target: number) {
    const { emulator, isRunning } = this.state;

    if (emulator && isRunning) {
      emulator.screen_set_scale(target);
      this.setState({ scale: target });
    }
  }

  /**
   * Send keys to the emulator (including the key-up),
   * if it's running
   *
   * @param {Array<number>} codes
   */
  private sendKeys(codes: Array<number>) {
    if (this.state.emulator && this.state.isRunning) {
      const scancodes = codes;

      // Push break codes (key-up)
      for (const scancode of scancodes) {
        scancodes.push(scancode | 0x80);
      }

      this.state.emulator.keyboard_send_scancodes(scancodes);
    }
  }

  /**
   * Reset the canvas
   */
  private resetCanvas() {
    const canvas = document.getElementById("emulator-canvas");

    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}
