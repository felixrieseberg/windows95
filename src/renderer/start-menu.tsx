import * as React from "react";

export interface StartMenuProps {
  navigate: (to: string) => void;
}

export class StartMenu extends React.Component<StartMenuProps, {}> {
  constructor(props: StartMenuProps) {
    super(props);

    this.navigate = this.navigate.bind(this);
  }

  public render() {
    return (
      <nav className="nav nav-bottom">
        <a onClick={this.navigate} href="#" id="start" className="nav-logo">
          <img src="../../static/start.png" alt="" />
          <span>Start</span>
        </a>
        <div className="nav-menu">
          <a onClick={this.navigate} href="#" id="floppy" className="nav-link">
            Floppy Disk
          </a>
          <a onClick={this.navigate} href="#" id="state" className="nav-link">
            Reset Machine
          </a>
          <a onClick={this.navigate} href="#" id="disk" className="nav-link">
            Modify C: Drive
          </a>
        </div>
      </nav>
    );
  }

  private navigate(event: React.SyntheticEvent<HTMLAnchorElement>) {
    this.props.navigate(event.currentTarget.id);
  }
}
