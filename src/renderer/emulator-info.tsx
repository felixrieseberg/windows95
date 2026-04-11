import * as React from "react";

interface EmulatorInfoProps {
  toggleInfo: () => void;
  emulator: any;
  hidden: boolean;
}

interface EmulatorInfoState {
  cpu: number;
  diskRead: number;
  diskWrite: number;
  netRx: number;
  netTx: number;
  lastCounter: number;
  lastTick: number;
}

export class EmulatorInfo extends React.Component<
  EmulatorInfoProps,
  EmulatorInfoState
> {
  private tickInterval = -1;
  private diskReadBytes = 0;
  private diskWriteBytes = 0;
  private netRxBytes = 0;
  private netTxBytes = 0;

  constructor(props: EmulatorInfoProps) {
    super(props);

    this.tick = this.tick.bind(this);
    this.onIDEReadEnd = this.onIDEReadEnd.bind(this);
    this.onIDEWriteEnd = this.onIDEWriteEnd.bind(this);
    this.onEthReceiveEnd = this.onEthReceiveEnd.bind(this);
    this.onEthTransmitEnd = this.onEthTransmitEnd.bind(this);

    this.state = {
      cpu: 0,
      diskRead: 0,
      diskWrite: 0,
      netRx: 0,
      netTx: 0,
      lastCounter: 0,
      lastTick: 0,
    };
  }

  public render() {
    const { cpu, diskRead, diskWrite, netRx, netTx } = this.state;
    const { hidden, toggleInfo } = this.props;

    return (
      <>
        <div id="status-hotzone" />
        <div id="status" className={hidden ? "hidden" : ""}>
          CPU: <span>{cpu}M/s</span> | Disk:{" "}
          <span>R {this.rate(diskRead)}</span>{" "}
          <span>W {this.rate(diskWrite)}</span> | Net:{" "}
          <span>↓{this.rate(netRx)}</span> <span>↑{this.rate(netTx)}</span> |{" "}
          <a href="#" onClick={toggleInfo}>
            {hidden ? "Pin" : "Hide"}
          </a>
        </div>
      </>
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
        `Emulator info: Tried to install listeners, but emulator not defined yet.`,
      );
      return;
    }

    if (this.tickInterval > -1) {
      clearInterval(this.tickInterval);
    }

    // TypeScript think's we're using a Node.js setInterval. We're not.
    this.tickInterval = setInterval(this.tick, 500) as unknown as number;

    emulator.add_listener("ide-read-end", this.onIDEReadEnd);
    emulator.add_listener("ide-write-end", this.onIDEWriteEnd);
    emulator.add_listener("eth-receive-end", this.onEthReceiveEnd);
    emulator.add_listener("eth-transmit-end", this.onEthTransmitEnd);
  }

  /**
   * Stop listening to the emulator.
   */
  private uninstallListeners() {
    const { emulator } = this.props;

    if (!emulator) {
      console.log(
        `Emulator info: Tried to uninstall listeners, but emulator not defined yet.`,
      );
      return;
    }

    if (this.tickInterval > -1) {
      clearInterval(this.tickInterval);
    }

    emulator.remove_listener("ide-read-end", this.onIDEReadEnd);
    emulator.remove_listener("ide-write-end", this.onIDEWriteEnd);
    emulator.remove_listener("eth-receive-end", this.onEthReceiveEnd);
    emulator.remove_listener("eth-transmit-end", this.onEthTransmitEnd);
  }

  private onIDEReadEnd(args: number[]) {
    this.diskReadBytes += args[1];
  }

  private onIDEWriteEnd(args: number[]) {
    this.diskWriteBytes += args[1];
  }

  private onEthReceiveEnd(args: number[]) {
    this.netRxBytes += args[0];
  }

  private onEthTransmitEnd(args: number[]) {
    this.netTxBytes += args[0];
  }

  /**
   * Format bytes/sec into a compact human string.
   */
  private rate(bytesPerSec: number) {
    if (bytesPerSec <= 0) return "0";
    if (bytesPerSec < 1024) return `${bytesPerSec}B/s`;
    if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)}K/s`;
    return `${(bytesPerSec / 1024 / 1024).toFixed(1)}M/s`;
  }

  /**
   * Once per interval, compute CPU speed and I/O throughput.
   */
  private tick() {
    const { lastCounter, lastTick } = this.state;

    const now = Date.now();
    const instructionCounter = this.props.emulator.get_instruction_counter();
    const ips = instructionCounter - lastCounter;
    const deltaTime = now - lastTick;
    const deltaSec = deltaTime / 1000;

    this.setState({
      lastTick: now,
      lastCounter: instructionCounter,
      cpu: Math.round(ips / deltaTime / 1000),
      diskRead: Math.round(this.diskReadBytes / deltaSec),
      diskWrite: Math.round(this.diskWriteBytes / deltaSec),
      netRx: Math.round(this.netRxBytes / deltaSec),
      netTx: Math.round(this.netTxBytes / deltaSec),
    });

    this.diskReadBytes = 0;
    this.diskWriteBytes = 0;
    this.netRxBytes = 0;
    this.netTxBytes = 0;
  }
}
