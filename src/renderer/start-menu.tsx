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
        <a onClick={this.navigate} href="#" id="start" className="nav-link">
          <img src="../../static/start.png" alt="Start" />
          <span>Start</span>
        </a>
        <div className="nav-menu">
          <a
            onClick={this.navigate}
            href="#"
            id="settings"
            className="nav-link"
          >
            <img src="../../static/settings.png" />
            <span>Settings</span>
          </a>
          <a onClick={this.navigate} href="#" id="drive" className="nav-link">
            <img src="../../static/drive.png" />
            <span>Modify C: Drive</span>
          </a>
        </div>
      </nav>
    );
  }

  private navigate(event: React.SyntheticEvent<HTMLAnchorElement>) {
    this.props.navigate(event.currentTarget.id);
  }
}
