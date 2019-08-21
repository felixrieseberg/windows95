import * as React from "react";
import * as fs from "fs-extra";

import { CONSTANTS } from "../constants";

export interface CardStateProps {
  bootFromScratch: () => void;
}

export class CardState extends React.Component<CardStateProps, {}> {
  constructor(props: CardStateProps) {
    super(props);

    this.onReset = this.onReset.bind(this);
  }

  public render() {
    return (
      <section>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Machine State</h2>
          </div>
          <div className="card-body">
            <p>
              windows95 stores any changes to your machine (like saved files) in
              a state file. If you encounter any trouble, you can either reset
              your state or boot Windows 95 from scratch.
            </p>
            <button className="btn" onClick={this.onReset}>
              Reset state
            </button>
            <button className="btn" onClick={this.props.bootFromScratch}>
              Reboot from scratch
            </button>
          </div>
        </div>
      </section>
    );
  }

  public async onReset() {
    if (fs.existsSync(CONSTANTS.STATE_PATH)) {
      await fs.remove(CONSTANTS.STATE_PATH);
    }
  }
}
