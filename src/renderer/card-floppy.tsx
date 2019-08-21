import * as React from "react";

export interface CardFloppyProps {
  setFloppyPath: (path: string) => void;
  floppyPath?: string;
}

export class CardFloppy extends React.Component<CardFloppyProps, {}> {
  constructor(props: CardFloppyProps) {
    super(props);

    this.onChange = this.onChange.bind(this);
  }

  public render() {
    return (
      <section>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Floppy Drive</h2>
          </div>
          <div className="card-body">
            <input
              id="floppy-input"
              type="file"
              onChange={this.onChange}
              style={{ display: "none" }}
            />
            <p>
              windows95 comes with a virtual floppy drive. If you have floppy
              disk images in the "img" format, you can mount them here.
            </p>
            <p>
              Back in the 90s and before CD-ROM became a popular format,
              software was typically distributed on floppy disks. Some
              developers have since released their apps or games for free,
              usually on virtual floppy disks using the "img" format.
            </p>
            <p>
              Once you've mounted a disk image, you might have to reboot your
              virtual windows95 machine from scratch.
            </p>
            <p id="floppy-path">
              {this.props.floppyPath
                ? `Inserted Floppy Disk: ${this.props.floppyPath}`
                : `No floppy mounted`}
            </p>
            <button
              id="floppy-select"
              className="btn"
              onClick={() =>
                (document.querySelector("#floppy-input") as any).click()
              }
            >
              Mount floppy disk
            </button>
            <button id="floppy-reboot" className="btn">
              Reboot from scratch
            </button>
          </div>
        </div>
      </section>
    );
  }

  public onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const floppyFile =
      event.target.files && event.target.files.length > 0
        ? event.target.files[0]
        : null;

    if (floppyFile) {
      this.props.setFloppyPath(floppyFile.path);
    } else {
      console.log(`Floppy: Input changed but no file selected`);
    }
  }
}
