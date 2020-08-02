import * as React from "react";

interface EmulatorInfoProps {
  toggleInfo: () => void;
  emulator: any;
}

interface EmulatorInfoState {
  cpu: number;
  disk: string;
  lastCounter: number;
  lastTick: number;
}

export class EmulatorInfo extends React.Component<
  EmulatorInfoProps,
  EmulatorInfoState
> {
  private cpuInterval = -1;

  constructor(props: EmulatorInfoProps) {
    super(props);

    this.cpuCount = this.cpuCount.bind(this);
    this.onIDEReadStart = this.onIDEReadStart.bind(this);
    this.onIDEReadWriteEnd = this.onIDEReadWriteEnd.bind(this);

    this.state = {
      cpu: 0,
      disk: "Idle",
      lastCounter: 0,
      lastTick: 0,
    };
  }

  public render() {
    const { cpu, disk } = this.state;

    return (
      <div id="status">
        Disk: <span>{disk}</span> | CPU Speed: <span>{cpu}</span> |{" "}
        <a href="#" onClick={this.props.toggleInfo}>
          Hide
        </a>
      </div>
    );
  }

  public componentWillUnmount() {
    this.uninstallListeners();
  }

  /**
   * The emulator starts whenever, so install or uninstall listeners
   * at the right time
   *
   * @param newProps
   */
  public componentDidUpdate(prevProps: EmulatorInfoProps) {
    if (prevProps.emulator !== this.props.emulator) {
      if (this.props.emulator) {
        this.installListeners();
      } else {
        this.uninstallListeners();
      }
    }
  }

  /**
   * Let's start listening to what the emulator is up to.
   */
  private installListeners() {
    const { emulator } = this.props;

    if (!emulator) {
      console.log(
        `Emulator info: Tried to install listeners, but emulator not defined yet.`
      );
      return;
    }

    // CPU
    if (this.cpuInterval > -1) {
      clearInterval(this.cpuInterval);
    }

    // TypeScript think's we're using a Node.js setInterval. We're not.
    this.cpuInterval = (setInterval(this.cpuCount, 500) as unknown) as number;

    // Disk
    emulator.add_listener("ide-read-start", this.onIDEReadStart);
    emulator.add_listener("ide-read-end", this.onIDEReadWriteEnd);
    emulator.add_listener("ide-write-end", this.onIDEReadWriteEnd);

    // Screen
    emulator.add_listener("screen-set-size-graphical", console.log);
  }

  /**
   * Stop listening to the emulator.
   */
  private uninstallListeners() {
    const { emulator } = this.props;

    if (!emulator) {
      console.log(
        `Emulator info: Tried to uninstall listeners, but emulator not defined yet.`
      );
      return;
    }

    // CPU
    if (this.cpuInterval > -1) {
      clearInterval(this.cpuInterval);
    }

    // Disk
    emulator.remove_listener("ide-read-start", this.onIDEReadStart);
    emulator.remove_listener("ide-read-end", this.onIDEReadWriteEnd);
    emulator.remove_listener("ide-write-end", this.onIDEReadWriteEnd);

    // Screen
    emulator.remove_listener("screen-set-size-graphical", console.log);
  }

  /**
   * The virtual IDE is handling read (start).
   */
  private onIDEReadStart() {
    this.requestIdle(() => this.setState({ disk: "Read" }));
  }

  /**
   * The virtual IDE is handling read/write (end).
   */
  private onIDEReadWriteEnd() {
    this.requestIdle(() => this.setState({ disk: "Idle" }));
  }

  /**
   * Request an idle callback with a 3s timeout.
   *
   * @param fn
   */
  private requestIdle(fn: () => void) {
    (window as any).requestIdleCallback(fn, { timeout: 3000 });
  }

  /**
   * Calculates what's up with the virtual cpu.
   */
  private cpuCount() {
    const { lastCounter, lastTick } = this.state;

    const now = Date.now();
    const instructionCounter = this.props.emulator.get_instruction_counter();
    const ips = instructionCounter - lastCounter;
    const deltaTime = now - lastTick;

    this.setState({
      lastTick: now,
      lastCounter: instructionCounter,
      cpu: Math.round(ips / deltaTime),
    });
  }
}
