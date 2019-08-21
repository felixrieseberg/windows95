import * as React from "react";

export interface CardStartProps {
  startEmulator: () => void;
}

export class CardStart extends React.Component<CardStartProps, {}> {
  public render() {
    return (
      <section id="section-start" className="visible">
        <div
          className="btn btn-start"
          id="win95"
          onClick={this.props.startEmulator}
        >
          Start Windows 95
          <br />
          <small>Hit ESC to lock or unlock your mouse</small>
        </div>
      </section>
    );
  }
}
