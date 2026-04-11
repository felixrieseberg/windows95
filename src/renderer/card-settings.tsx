import * as React from "react";

import { resetState } from "./utils/reset-state";

interface CardSettingsProps {
  bootFromScratch: () => void;
  setFloppy: (file: File) => void;
  setCdrom: (cdrom: File) => void;
  floppy?: File;
  cdrom?: File;
}

interface CardSettingsState {
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
      isStateReset: false,
    };
  }

  public render() {
    return (
      <section>
        <div className="card settings">
          <div className="card-header">
            <h2 className="card-title">
              <img src="../../static/settings.png" />
              Settings
            </h2>
          </div>
          <div className="card-body">
            {this.renderCdrom()}
            <hr />
            {this.renderFloppy()}
            <hr />
            {this.renderState()}
          </div>
        </div>
      </section>
    );
  }

  public renderCdrom() {
    // CD is currently not working, so.. let's return nothing.
    return null;

    const { cdrom } = this.props;

    return (
      <fieldset>
        <legend>
          <img src="../../static/cdrom.png" />
          CD-ROM
        </legend>
        <input
          id="cdrom-input"
          type="file"
          onChange={this.onChangeCdrom}
          style={{ display: "none" }}
        />
        <p>
          windows95 comes with a virtual CD drive. It can mount images in the
          "iso" format.
        </p>
        <p id="floppy-path">
          {cdrom ? `Inserted CD: ${cdrom?.name}` : `No CD mounted`}
        </p>
        <button
          className="btn"
          onClick={() =>
            (document.querySelector("#cdrom-input") as any).click()
          }
        >
          <img src="../../static/select-cdrom.png" />
          <span>Mount CD</span>
        </button>
      </fieldset>
    );
  }

  public renderFloppy() {
    const { floppy } = this.props;

    return (
      <fieldset>
        <legend>
          <img src="../../static/floppy.png" />
          Floppy
        </legend>
        <input
          id="floppy-input"
          type="file"
          onChange={this.onChangeFloppy}
          style={{ display: "none" }}
        />
        <p>
          windows95 comes with a virtual floppy drive. It can mount floppy disk
          images in the "img" format.
        </p>
        <p>
          Back in the 90s and before CD-ROMs became a popular, software was
          typically distributed on floppy disks. Some developers have since
          released their apps or games for free, usually on virtual floppy disks
          using the "img" format.
        </p>
        <p>
          Once you've mounted a disk image, you might have to boot your virtual
          windows95 machine from scratch.
        </p>
        <p id="floppy-path">
          {floppy
            ? `Inserted Floppy Disk: ${floppy.name}`
            : `No floppy mounted`}
        </p>
        <button
          className="btn"
          onClick={() =>
            (document.querySelector("#floppy-input") as any).click()
          }
        >
          <img src="../../static/select-floppy.png" />
          <span>Mount floppy disk</span>
        </button>
      </fieldset>
    );
  }

  public renderState() {
    const { isStateReset } = this.state;
    const { bootFromScratch } = this.props;

    return (
      <fieldset>
        <legend>
          <img src="../../static/reset.png" />
          Reset machine state
        </legend>
        <div>
          <p>
            windows95 stores changes to your machine (like saved files) in a
            state file. If you encounter any trouble, you can reset your state
            or boot Windows 95 from scratch.{" "}
            <strong>All your changes will be lost.</strong>
          </p>
          <button
            className="btn"
            onClick={this.onResetState}
            disabled={isStateReset}
            style={{ marginRight: "5px" }}
          >
            <img src="../../static/reset-state.png" />
            {isStateReset ? "State reset" : "Reset state"}
          </button>
          <button className="btn" onClick={bootFromScratch}>
            <img src="../../static/boot-fresh.png" />
            Boot from scratch
          </button>
        </div>
      </fieldset>
    );
  }

  /**
   * Handle a change in the floppy input
   *
   * @param event
   */
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

  /**
   * Handle a change in the cdrom input
   *
   * @param event
   */
  private onChangeCdrom(event: React.ChangeEvent<HTMLInputElement>) {
    const CdromFile =
      event.target.files && event.target.files.length > 0
        ? event.target.files[0]
        : null;

    if (CdromFile) {
      this.props.setCdrom(CdromFile);
    } else {
      console.log(`Cdrom: Input changed but no file selected`);
    }
  }

  /**
   * Handle the state reset
   */
  private async onResetState() {
    await resetState();
    this.setState({ isStateReset: true });
  }
}
