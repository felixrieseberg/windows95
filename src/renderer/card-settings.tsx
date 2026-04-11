import * as React from "react";

import { resetState } from "./utils/reset-state";

interface CardSettingsProps {
  bootFromScratch: () => void;
  setFloppy: (file: File) => void;
  setCdrom: (cdrom: File) => void;
  setSmbSharePath: (path: string) => void;
  pickFolder: () => Promise<string | null>;
  navigate: (to: string) => void;
  floppy?: File;
  cdrom?: File;
  smbSharePath: string;
}

type Tab = "floppy" | "network" | "state";

interface CardSettingsState {
  tab: Tab;
  isStateReset: boolean;
}

export class CardSettings extends React.Component<
  CardSettingsProps,
  CardSettingsState
> {
  constructor(props: CardSettingsProps) {
    super(props);

    this.onChangeFloppy = this.onChangeFloppy.bind(this);
    this.onChangeCdrom = this.onChangeCdrom.bind(this);
    this.onResetState = this.onResetState.bind(this);

    this.state = {
      tab: "floppy",
      isStateReset: false,
    };
  }

  public render() {
    const { tab } = this.state;

    return (
      <div className="window settings-window">
        <div className="title-bar">
          <div className="title-bar-text">windows95 Properties</div>
          <div className="title-bar-controls">
            <button aria-label="Help" disabled />
            <button
              aria-label="Close"
              onClick={() => this.props.navigate("start")}
            />
          </div>
        </div>
        <div className="window-body">
          <menu role="tablist">
            {this.renderTab("floppy", "Floppy Drive")}
            {this.renderTab("network", "Network Share")}
            {this.renderTab("state", "Machine State")}
          </menu>
          <div className="window settings-panel" role="tabpanel">
            <div className="window-body">
              {tab === "floppy" && this.renderFloppy()}
              {tab === "network" && this.renderSmbShare()}
              {tab === "state" && this.renderState()}
            </div>
          </div>
          <div className="settings-footer">
            <button
              className="default"
              onClick={() => this.props.navigate("start")}
            >
              OK
            </button>
            <button onClick={() => this.props.navigate("start")}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  private renderTab(id: Tab, label: string) {
    return (
      <li
        role="tab"
        aria-selected={this.state.tab === id}
        onClick={() => this.setState({ tab: id })}
      >
        <a href="#">{label}</a>
      </li>
    );
  }

  private renderFloppy() {
    const { floppy } = this.props;

    return (
      <fieldset>
        <legend>Drive A:</legend>
        <input
          id="floppy-input"
          type="file"
          onChange={this.onChangeFloppy}
          style={{ display: "none" }}
        />
        <div className="settings-row">
          <img className="settings-icon" src="../../static/floppy.png" />
          <p>
            windows95 ships with a virtual 3½" floppy drive. Mount an{" "}
            <code>.img</code> disk image here, then boot the machine to read it
            from inside Windows.
          </p>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="floppy-path">Mounted image</label>
          <input
            id="floppy-path"
            type="text"
            readOnly
            value={floppy ? floppy.name : "(No disk in drive)"}
          />
        </div>
        <div className="settings-buttons">
          <button
            onClick={() =>
              (document.querySelector("#floppy-input") as any).click()
            }
          >
            Mount image...
          </button>
        </div>
      </fieldset>
    );
  }

  private renderSmbShare() {
    const { smbSharePath } = this.props;

    return (
      <fieldset>
        <legend>\\HOST\HOST</legend>
        <div className="settings-row">
          <img className="settings-icon" src="../../static/show-disk-image.png" />
          <p>
            A folder on your computer is exposed inside Windows 95 as a network
            drive. From inside Windows, open Start → Run and type{" "}
            <code>\\HOST\HOST</code> — or use Map Network Drive to give it a
            letter.
          </p>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="smb-path">Shared folder</label>
          <input id="smb-path" type="text" readOnly value={smbSharePath} />
        </div>
        <div className="settings-buttons">
          <button
            onClick={async () => {
              const picked = await this.props.pickFolder();
              if (picked) this.props.setSmbSharePath(picked);
            }}
          >
            Choose folder...
          </button>
        </div>
      </fieldset>
    );
  }

  private renderState() {
    const { isStateReset } = this.state;
    const { bootFromScratch } = this.props;

    return (
      <fieldset>
        <legend>Reset</legend>
        <div className="settings-row">
          <img className="settings-icon" src="../../static/reset.png" />
          <p>
            Changes to your machine (saved files, installed programs) are stored
            in a state file. If something breaks, you can either discard that
            state or boot a fresh copy of Windows from scratch.{" "}
            <strong>All your changes will be lost.</strong>
          </p>
        </div>
        <div className="settings-buttons">
          <button onClick={this.onResetState} disabled={isStateReset}>
            {isStateReset ? "State has been reset" : "Reset state"}
          </button>
          <button onClick={bootFromScratch}>Boot from scratch</button>
        </div>
      </fieldset>
    );
  }

  private onChangeFloppy(event: React.ChangeEvent<HTMLInputElement>) {
    const floppyFile =
      event.target.files && event.target.files.length > 0
        ? event.target.files[0]
        : null;

    if (floppyFile) {
      this.props.setFloppy(floppyFile);
    } else {
      console.log(`Floppy: Input changed but no file selected`);
    }
  }

  private onChangeCdrom(event: React.ChangeEvent<HTMLInputElement>) {
    const cdromFile =
      event.target.files && event.target.files.length > 0
        ? event.target.files[0]
        : null;

    if (cdromFile) {
      this.props.setCdrom(cdromFile);
    } else {
      console.log(`Cdrom: Input changed but no file selected`);
    }
  }

  private async onResetState() {
    await resetState();
    this.setState({ isStateReset: true });
  }
}
