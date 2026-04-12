import * as path from "path";

const IMAGES_PATH = path.join(__dirname, "../../images");

// Bump when a release ships a v86/hardware/disk-image change that can't load
// older state-vN.bin snapshots. The app will detect an orphaned older state
// and offer to export the user's old C:\ as a mountable .img.
//
// That export splices the state's dirty-block overlay onto the *current*
// windows95.img — which only works while the partition table and FAT geometry
// stay constant across releases. If you ever resize the disk or reformat with
// different cluster params, the recovered .img won't mount.
export const STATE_VERSION = 4;

export const CONSTANTS = {
  IMAGES_PATH,
  IMAGE_PATH: path.join(IMAGES_PATH, "windows95.img"),
  IMAGE_DEFAULT_SIZE: 1073741824, // 1GB
  DEFAULT_STATE_PATH: path.join(IMAGES_PATH, "default-state.bin"),
  TOOLS_PATH: path.join(__dirname, "../../guest-tools"),
};

export const IPC_COMMANDS = {
  TOGGLE_INFO: "TOGGLE_INFO",
  SHOW_DISK_IMAGE: "SHOW_DISK_IMAGE",
  ZOOM_IN: "ZOOM_IN",
  ZOOM_OUT: "ZOOM_OUT",
  ZOOM_RESET: "ZOOM_RESET",
  // Machine instructions
  MACHINE_START: "MACHINE_START",
  MACHINE_BOOT_FROM_SCRATCH: "MACHINE_BOOT_FROM_SCRATCH",
  MACHINE_RESTART: "MACHINE_RESTART",
  MACHINE_STOP: "MACHINE_STOP",
  MACHINE_RESET: "MACHINE_RESET",
  MACHINE_ALT_F4: "MACHINE_ALT_F4",
  MACHINE_ESC: "MACHINE_ESC",
  MACHINE_ALT_ENTER: "MACHINE_ALT_ENTER",
  MACHINE_CTRL_ALT_DEL: "MACHINE_CTRL_ALT_DEL",
  // Machine events
  MACHINE_STARTED: "MACHINE_STARTED",
  MACHINE_STOPPED: "MACHINE_STOPPED",
  // Else
  APP_QUIT: "APP_QUIT",
  GET_STATE_PATH: "GET_STATE_PATH",
  GET_LEGACY_STATE_PATH: "GET_LEGACY_STATE_PATH",
  GET_DOWNLOADS_PATH: "GET_DOWNLOADS_PATH",
  GET_SMB_SHARE_PATH: "GET_SMB_SHARE_PATH",
  SET_SMB_SHARE_PATH: "SET_SMB_SHARE_PATH",
  PICK_FOLDER: "PICK_FOLDER",
};
