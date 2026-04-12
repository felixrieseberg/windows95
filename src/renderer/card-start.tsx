import * as React from "react";

export interface CardStartProps {
  startEmulator: () => void;
  navigate: (to: "start" | "settings") => void;
  legacyStatePath: string | null;
  legacyRecovered: { dir: string; files: number } | null;
  legacyRecoverBusy: boolean;
  legacyRecoverError: string | null;
  recoverLegacy: () => void;
  showRecovered: () => void;
  discardLegacy: () => void;
}

const TIPS = [
  "Press the Escape key at any time to release or recapture your mouse cursor.",
  "You can mount a floppy image from Settings before booting to install vintage software.",
  "A folder from your real computer is mounted as drive Z: — open My Computer inside Windows to find it.",
  "Your machine state is saved automatically when you quit. Reset it from Settings if things get weird.",
  "Use the Machine menu in the menubar to send Ctrl+Alt+Del and other special key combos.",
];

export class CardStart extends React.Component<CardStartProps> {
  private tip = TIPS[Math.floor(Math.random() * TIPS.length)];

  public render() {
    return (
      <div className="window welcome" id="welcome-window">
        <div className="title-bar">
          <div className="title-bar-text">Welcome</div>
          <div className="title-bar-controls">
            <button aria-label="Minimize" disabled />
            <button aria-label="Maximize" disabled />
            <button aria-label="Close" disabled />
          </div>
        </div>
        <div className="window-body welcome-body">
          <aside className="welcome-stripe">
            <span>Windows&nbsp;95</span>
          </aside>
          <div className="welcome-main">
            <h1 className="welcome-title">
              Welcome to <span>Windows</span>
              <small>95</small>
            </h1>

            {this.props.legacyStatePath
              ? this.renderLegacyNotice()
              : this.renderTip()}
          </div>
          <div className="welcome-actions">
            <button
              id="win95"
              className="default"
              onClick={this.props.startEmulator}
            >
              <u>S</u>tart Windows 95
            </button>
            <button onClick={() => this.props.navigate("settings")}>
              S<u>e</u>ttings...
            </button>
            <div className="welcome-spacer" />
            <button disabled>What's New</button>
          </div>
        </div>
      </div>
    );
  }

  private renderTip() {
    return (
      <div className="welcome-tip">
        <div className="welcome-tip-header">
          <strong>Did you know...</strong>
        </div>
        <p>{this.tip}</p>
      </div>
    );
  }

  private renderLegacyNotice() {
    const { legacyRecovered, legacyRecoverBusy, legacyRecoverError } =
      this.props;

    if (legacyRecoverError) {
      return (
        <div className="welcome-tip welcome-warn">
          <div className="welcome-tip-header">
            <strong>Recovery failed</strong>
          </div>
          <p>
            The old snapshot's format isn't compatible with the bundled
            emulator, so files couldn't be extracted automatically. The snapshot
            has been kept on disk.
          </p>
          <p>
            <code>{legacyRecoverError}</code>
          </p>
          <div className="welcome-warn-buttons">
            <button onClick={this.props.discardLegacy}>
              Discard old snapshot
            </button>
          </div>
        </div>
      );
    }

    if (legacyRecovered) {
      return (
        <div className="welcome-tip welcome-warn">
          <div className="welcome-tip-header">
            <strong>Old C:\ recovered</strong>
          </div>
          <p>
            {legacyRecovered.files} file
            {legacyRecovered.files === 1 ? "" : "s"} you created or modified
            have been copied out as ordinary files. Starting Windows here will
            be a fresh machine.
          </p>
          <p>
            <code>{legacyRecovered.dir}</code>
          </p>
          <div className="welcome-warn-buttons">
            <button className="default" onClick={this.props.showRecovered}>
              Open folder
            </button>
            <button onClick={this.props.discardLegacy}>
              Discard old snapshot
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="welcome-tip welcome-warn">
        <div className="welcome-tip-header">
          <strong>Your saved machine is from an older version</strong>
        </div>
        <p>
          This release ships a new disk image and machine configuration. Files
          you saved to <code>C:\</code> live only in the old snapshot.
        </p>
        <p>
          Recovery copies anything you created or modified out to an ordinary
          folder on this computer — no booting, no disk images. Pre-installed
          programs are skipped.
        </p>
        <div className="welcome-warn-buttons">
          <button
            className="default"
            disabled={legacyRecoverBusy}
            onClick={this.props.recoverLegacy}
          >
            {legacyRecoverBusy ? "Recovering…" : "Recover old C:\\ drive…"}
          </button>
          <button
            disabled={legacyRecoverBusy}
            onClick={this.props.discardLegacy}
          >
            Discard it
          </button>
        </div>
      </div>
    );
  }
}
