import * as React from "react";
import * as fs from "fs-extra";
import * as path from "path";
import { ipcRenderer, remote, shell } from "electron";

import { CONSTANTS, IPC_COMMANDS } from "../constants";
import { getDiskImageSize } from "../utils/disk-image-size";
import { CardStart } from "./card-start";
import { StartMenu } from "./start-menu";
import { CardFloppy } from "./card-floppy";
import { CardState } from "./card-state";
import { EmulatorInfo } from "./emulator-info";

export interface EmulatorState {
  currentUiCard: string;
  emulator?: any;
  floppyFile?: string;
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

    this.state = {
      isBootingFresh: false,
      isCursorCaptured: false,
      isRunning: false,
      currentUiCard: "start",
      isInfoDisplayed: true
    };

    this.setupInputListeners();
    this.setupIpcListeners();
    this.setupUnloadListeners();

    if (document.location.hash.includes("AUTO_START")) {
      this.startEmulator();
    }
  }

  /**
   * We want to capture and release the mouse at appropriate times.
   */
  public setupInputListeners() {
    // ESC
    document.onkeydown = evt => {
      const { emulator, isCursorCaptured } = this.state;

      evt = evt || window.event;

      if (evt.keyCode === 27) {
        if (isCursorCaptured) {
          this.setState({ isCursorCaptured: false });

          if (emulator) {
            emulator.mouse_set_status(false);
          }

          document.exitPointerLock();
        } else {
          this.setState({ isCursorCaptured: true });

          if (emulator) {
            emulator.lock_mouse();
          }
        }
      }
    };

    // Click
    document.addEventListener("click", () => {
      if (!this.state.isCursorCaptured) {
        this.setState({ isCursorCaptured: true });
        this.state.emulator.mouse_set_status(true);
        this.state.emulator.lock_mouse();
      }
    });
  }

  /**
   * Save the emulator's state to disk during exit.
   */
  public setupUnloadListeners() {
    const handleClose = async () => {
      await this.saveState();
      this.isQuitting = true;
      remote.app.quit();
    };

    window.onbeforeunload = event => {
      if (this.isQuitting) return;
      if (this.isResetting) return;

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
      if (this.state.emulator && this.state.isRunning) {
        this.state.emulator.keyboard_send_scancodes([
          0x1d, // ctrl
          0x38, // alt
          0x53, // delete

          // break codes
          0x1d | 0x80,
          0x38 | 0x80,
          0x53 | 0x80
        ]);
      }
    });

    ipcRenderer.on(IPC_COMMANDS.MACHINE_RESTART, () => {
      if (this.state.emulator && this.state.isRunning) {
        this.state.emulator.restart();
      }
    });

    ipcRenderer.on(IPC_COMMANDS.TOGGLE_INFO, () => {
      this.setState({ isInfoDisplayed: !this.state.isInfoDisplayed });
    });

    ipcRenderer.on(IPC_COMMANDS.SHOW_DISK_IMAGE, () => {
      this.showDiskImage();
    });
  }

  /**
   * If the emulator isn't running, this is rendering the, erm, UI.
   *
   * 🤡
   */
  public renderUI() {
    const { isRunning, currentUiCard } = this.state;

    if (isRunning) {
      return null;
    }

    let card;

    if (currentUiCard === "floppy") {
      card = (
        <CardFloppy
          setFloppyPath={floppyFile => this.setState({ floppyFile })}
          floppyPath={this.state.floppyFile}
        />
      );
    } else if (currentUiCard === "state") {
      card = <CardState bootFromScratch={this.bootFromScratch} />;
    } else {
      card = <CardStart startEmulator={this.startEmulator} />;
    }

    return (
      <>
        {card}
        <StartMenu
          navigate={target => this.setState({ currentUiCard: target })}
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
        <EmulatorInfo
          emulator={this.state.emulator}
          toggleInfo={() => {
            this.setState({ isInfoDisplayed: !this.state.isInfoDisplayed });
          }}
        />
        {this.renderUI()}
        <div id="emulator">
          <div></div>
          <canvas></canvas>
        </div>
      </>
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
    const imagePath = path
      .join(__dirname, "images/windows95.img")
      .replace("app.asar", "app.asar.unpacked");

    shell.showItemInFolder(imagePath);
  }

  /**
   * Start the actual emulator
   */
  public async startEmulator() {
    document.body.classList.remove("paused");

    const imageSize = await getDiskImageSize();
    const options = {
      memory_size: 128 * 1024 * 1024,
      video_memory_size: 32 * 1024 * 1024,
      screen_container: document.getElementById("emulator"),
      bios: {
        url: "../../bios/seabios.bin"
      },
      vga_bios: {
        url: "../../bios/vgabios.bin"
      },
      hda: {
        url: "../../images/windows95.img",
        async: true,
        size: imageSize
      },
      fda: {
        buffer: this.state.floppyFile
      },
      boot_order: 0x132
    };

    console.log(`Starting emulator with options`, options);

    // New v86 instance
    this.setState({
      emulator: new V86Starter(options),
      isRunning: true
    });

    // Restore state. We can't do this right away
    // and randomly chose 500ms as the appropriate
    // wait time (lol)
    setTimeout(async () => {
      if (!this.state.isBootingFresh) {
        this.restoreState();
      }

      this.state.emulator.lock_mouse();
      this.state.emulator.run();
    }, 500);
  }

  /**
   * Reset the emulator by reloading the whole page (lol)
   */
  public async resetEmulator() {
    this.isResetting = true;
    document.location.hash = `#AUTO_START`;
    document.location.reload();
  }

  /**
   * Take the emulators state and write it to disk. This is possibly
   * a fairly big file.
   */
  public async saveState(): Promise<void> {
    const { emulator } = this.state;

    if (!emulator || !emulator.save_state) {
      console.log(`restoreState: No emulator present`);
      return;
    }

    return new Promise(resolve => {
      emulator.save_state(async (error: Error, newState: ArrayBuffer) => {
        if (error) {
          console.warn(`saveState: Could not save state`, error);
          return;
        }

        await fs.outputFile(CONSTANTS.STATE_PATH, Buffer.from(newState));

        console.log(`saveState: Saved state to ${CONSTANTS.STATE_PATH}`);

        resolve();
      });
    });
  }

  /**
   * Restores state to the emulator.
   */
  public restoreState() {
    const { emulator } = this.state;
    const state = this.getState();

    // Nothing to do with if we don't have a state
    if (!state) {
      console.log(`restoreState: No state present, not restoring.`);
    }

    if (!emulator) {
      console.log(`restoreState: No emulator present`);
    }

    try {
      this.state.emulator.restore_state(state);
    } catch (error) {
      console.log(
        `State: Could not read state file. Maybe none exists?`,
        error
      );
    }
  }

  /**
   * Returns the current machine's state - either what
   * we have saved or alternatively the default state.
   *
   * @returns {ArrayBuffer}
   */
  public getState(): ArrayBuffer | null {
    const statePath = fs.existsSync(CONSTANTS.STATE_PATH)
      ? CONSTANTS.STATE_PATH
      : CONSTANTS.DEFAULT_STATE_PATH;

    if (fs.existsSync(statePath)) {
      return fs.readFileSync(statePath).buffer;
    }

    return null;
  }
}
