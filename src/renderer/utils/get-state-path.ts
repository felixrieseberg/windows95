import { ipcRenderer } from "electron";
import { IPC_COMMANDS } from "../../constants";

let _statePath = "";

export async function getStatePath(): Promise<string> {
  if (_statePath) {
    return _statePath;
  }

  const statePath = await ipcRenderer.invoke(IPC_COMMANDS.GET_STATE_PATH);
  return (_statePath = statePath);
}
