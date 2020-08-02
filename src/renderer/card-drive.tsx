import * as React from "react";

interface CardDriveProps {
  showDiskImage: () => void;
}

interface CardDriveState {}

export class CardDrive extends React.Component<CardDriveProps, CardDriveState> {
  constructor(props: CardDriveProps) {
    super(props);

    this.state = {};
  }

  public render() {
    let advice: JSX.Element | null = null;

    if (process.platform === "win32") {
      advice = this.renderAdviceWindows();
    } else if (process.platform === "darwin") {
      advice = this.renderAdviceMac();
    } else {
      advice = this.renderAdviceLinux();
    }

    return (
      <section>
        <div className="card settings">
          <div className="card-header">
            <h2 className="card-title">
              <img src="../../static/drive.png" />
              Modify C: Drive
            </h2>
          </div>
          <div className="card-body">
            <p>
              windows95 (this app) uses a raw disk image. Windows 95 (the
              operating system) is fragile, so adding or removing files is
              risky.
            </p>
            {advice}
          </div>
        </div>
      </section>
    );
  }

  public renderAdviceWindows(): JSX.Element {
    return (
      <fieldset>
        <legend>Changing the disk on Windows</legend>
        <p>
          Windows 10 cannot mount raw disk images (ironically, macOS and Linux
          can). However, tools exist that let you mount this drive, like the
          freeware tool <a href="https://google.com">OSFMount</a>. I am not
          affiliated with it, so please use it at your own risk.
        </p>
        {this.renderMountButton("Windows Explorer")}
      </fieldset>
    );
  }

  public renderAdviceMac(): JSX.Element {
    return (
      <fieldset>
        <legend>Changing the disk on macOS</legend>
        <p>
          macOS can mount the disk image directly. Click the button below to see
          the disk image in Finder. Then, double-click the image to mount it.
        </p>
        {this.renderMountButton("Finder")}
      </fieldset>
    );
  }

  public renderAdviceLinux(): JSX.Element {
    return (
      <fieldset>
        <legend>Changing the disk on Linux</legend>
        <p>
          There are plenty of tools that enable Linux users to mount and modify
          disk images. The disk image used by windows95 is a raw "img" disk
          image and can probably be mounted using the <code>mount</code> tool,
          which is likely installed on your machine.
        </p>
        {this.renderMountButton("file viewer")}
      </fieldset>
    );
  }

  public renderMountButton(explorer: string) {
    return (
      <button className="btn" onClick={this.props.showDiskImage}>
        <img src="../../static/show-disk-image.png" />
        <span>Show disk image in {explorer}</span>
      </button>
    );
  }
}
