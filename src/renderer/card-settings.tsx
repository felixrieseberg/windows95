import * as React from "react";

import { resetState } from "./utils/reset-state";
import { InfoBarSettings } from "./info-bar-settings";

const CDROM_ENABLED = true;

interface CardSettingsProps {
  bootFromScratch: () => void;
  setFloppy: (file: File) => void;
  setCdrom: (file: File) => void;
  setSmbSharePath: (path: string) => void;
  pickFolder: () => Promise<string | null>;
  navigate: (to: "start" | "settings") => void;
  floppy?: File;
  cdrom?: File;
  smbSharePath: string;
  infoBarSettings: InfoBarSettings;
  setInfoBarSettings: (s: InfoBarSettings) => void;
}

type Tab = "floppy" | "cdrom" | "network" | "interface" | "state";

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
            {CDROM_ENABLED && this.renderTab("cdrom", "CD-ROM")}
            {this.renderTab("network", "Shared Folder")}
            {this.renderTab("interface", "Interface")}
            {this.renderTab("state", "Machine State")}
          </menu>
          <div className="window settings-panel" role="tabpanel">
            <div className="window-body">
              {tab === "floppy" && this.renderFloppy()}
              {tab === "cdrom" && this.renderCdrom()}
              {tab === "network" && this.renderSmbShare()}
              {tab === "interface" && this.renderInterface()}
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

  private renderCdrom() {
    const { cdrom } = this.props;

    return (
      <fieldset>
        <legend>Drive D:</legend>
        <input
          id="cdrom-input"
          type="file"
          onChange={this.onChangeCdrom}
          style={{ display: "none" }}
        />
        <div className="settings-row">
          <img className="settings-icon" src="../../static/cdrom.png" />
          <p>
            windows95 ships with a virtual CD-ROM drive. Mount an{" "}
            <code>.iso</code> image here, then boot the machine to read it from
            inside Windows.
          </p>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="cdrom-path">Mounted image</label>
          <input
            id="cdrom-path"
            type="text"
            readOnly
            value={cdrom ? cdrom.name : "(No disc in drive)"}
          />
        </div>
        <div className="settings-buttons">
          <button
            onClick={() =>
              (document.querySelector("#cdrom-input") as any).click()
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
        <legend>Drive Z:</legend>
        <div className="settings-row">
          <img
            className="settings-icon"
            src="../../static/show-disk-image.png"
          />
          <p>
            A folder on your computer is mounted inside Windows 95 as drive{" "}
            <code>Z:</code>. Open My Computer inside Windows to find it.
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

  private renderInterface() {
    const { infoBarSettings, setInfoBarSettings } = this.props;

    const checkbox = (key: keyof InfoBarSettings, label: string) => (
      <div className="field-row">
        <input
          id={`ibs-${key}`}
          type="checkbox"
          checked={infoBarSettings[key]}
          onChange={(e) =>
            setInfoBarSettings({ ...infoBarSettings, [key]: e.target.checked })
          }
        />
        <label htmlFor={`ibs-${key}`}>{label}</label>
      </div>
    );

    return (
      <fieldset>
        <legend>Info bar</legend>
        <div className="settings-row">
          <img className="settings-icon" src="../../static/settings.png" />
          <p>
            The bar at the top of the emulator shows live machine stats. Choose
            which metrics to display and whether to draw sparkline graphs next
            to them.
          </p>
        </div>
        {checkbox("showCpu", "Show CPU speed")}
        {checkbox("showDisk", "Show disk throughput")}
        {checkbox("showNet", "Show network throughput")}
        {checkbox("showSparklines", "Show sparklines")}
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
