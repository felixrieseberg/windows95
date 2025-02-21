import fs from "fs";
import { getStatePath } from "./get-state-path";

export async function resetState() {
  const statePath = await getStatePath();

  if (fs.existsSync(statePath)) {
    try {
      await fs.promises.unlink(statePath);
    } catch (error) {
      console.error(`Failed to delete state file: ${error}`);
    }
  }
}
