import * as React from "react";
import { InfoBarSettings } from "./info-bar-settings";

interface EmulatorInfoProps {
  toggleInfo: () => void;
  emulator: any;
  hidden: boolean;
  settings: InfoBarSettings;
}

interface EmulatorInfoState {
  cpu: number;
  diskRead: number;
  diskWrite: number;
  netRx: number;
  netTx: number;
  lastCounter: number;
  lastTick: number;
  history: {
    cpu: number[];
    diskRead: number[];
    diskWrite: number[];
    netRx: number[];
    netTx: number[];
  };
}

const HISTORY_LEN = 30;

function Sparkline({ data }: { data: number[] }) {
  const w = 20;
  const h = 12;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${i * step},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} />
    </svg>
  );
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
      history: {
        cpu: new Array(HISTORY_LEN).fill(0),
        diskRead: new Array(HISTORY_LEN).fill(0),
        diskWrite: new Array(HISTORY_LEN).fill(0),
        netRx: new Array(HISTORY_LEN).fill(0),
        netTx: new Array(HISTORY_LEN).fill(0),
      },
    };
  }

  public render() {
    const { cpu, diskRead, diskWrite, netRx, netTx, history } = this.state;
    const { hidden, toggleInfo, settings } = this.props;
    const { showCpu, showDisk, showNet, showSparklines: spark } = settings;

    return (
      <>
        <div id="status-hotzone" />
        <div id="status" className={hidden ? "hidden" : ""}>
          {showCpu && (
            <>
              CPU: {spark && <Sparkline data={history.cpu} />}
              {this.fmt(cpu, ["M", "G"])}/s |{" "}
            </>
          )}
          {showDisk && (
            <>
              Disk: {spark && <Sparkline data={history.diskRead} />}R{" "}
              {this.fmt(diskRead, ["B", "K", "M", "G"])}/s{" "}
              {spark && <Sparkline data={history.diskWrite} />}W{" "}
              {this.fmt(diskWrite, ["B", "K", "M", "G"])}/s |{" "}
            </>
          )}
          {showNet && (
            <>
              Net: {spark && <Sparkline data={history.netRx} />}↓
              {this.fmt(netRx, ["B", "K", "M", "G"])}/s{" "}
              {spark && <Sparkline data={history.netTx} />}↑
              {this.fmt(netTx, ["B", "K", "M", "G"])}/s |{" "}
            </>
          )}
          <a href="#" className="toggle" onClick={toggleInfo}>
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
   * Format a value as "N.NU" by walking the unit ladder until it fits in
   * one digit before the decimal. Always exactly 4 chars (e.g. "0.0B",
   * "3.2K", "9.9G") so the bar width never changes.
   */
  private fmt(value: number, units: string[]) {
    let v = Math.max(0, value);
    let u = 0;
    while (v >= 10 && u < units.length - 1) {
      v /= 1000;
      u++;
    }
    if (v >= 9.95) v = 9.9;
    return `${v.toFixed(1)}${units[u]}`;
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

    const cpu = Math.round(ips / deltaTime / 1000);
    const diskRead = Math.round(this.diskReadBytes / deltaSec);
    const diskWrite = Math.round(this.diskWriteBytes / deltaSec);
    const netRx = Math.round(this.netRxBytes / deltaSec);
    const netTx = Math.round(this.netTxBytes / deltaSec);

    const push = (arr: number[], v: number) => [...arr, v].slice(-HISTORY_LEN);

    this.setState((s) => ({
      lastTick: now,
      lastCounter: instructionCounter,
      cpu,
      diskRead,
      diskWrite,
      netRx,
      netTx,
      history: {
        cpu: push(s.history.cpu, cpu),
        diskRead: push(s.history.diskRead, diskRead),
        diskWrite: push(s.history.diskWrite, diskWrite),
        netRx: push(s.history.netRx, netRx),
        netTx: push(s.history.netTx, netTx),
      },
    }));

    this.diskReadBytes = 0;
    this.diskWriteBytes = 0;
    this.netRxBytes = 0;
    this.netTxBytes = 0;
  }
}
