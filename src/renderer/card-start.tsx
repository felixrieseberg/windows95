import * as React from "react";

export interface CardStartProps {
  startEmulator: () => void;
  navigate: (to: "start" | "settings") => void;
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

            <div className="welcome-tip">
              <div className="welcome-tip-header">
                <strong>Did you know...</strong>
              </div>
              <p>{this.tip}</p>
            </div>
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
}
