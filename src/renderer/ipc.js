export function setupIpcListeners () {
  const { windows95 } = window;

  windows95.on(windows95.CONSTANTS.MACHINE_RESTART, () => {
    if (!window.emulator || !window.emulator.is_running) return

    window.emulator.restart()
  })

  windows95.on(windows95.CONSTANTS.MACHINE_CTRL_ALT_DEL, () => {
    if (!window.emulator || !window.emulator.is_running) return
  
    window.emulator.keyboard_send_scancodes([
      0x1D, // ctrl
      0x38, // alt
      0x53, // delete
  
      // break codes
      0x1D | 0x80,
      0x38 | 0x80,
      0x53 | 0x80
    ])
  })
  
  windows95.on(windows95.CONSTANTS.SHOW_DISK_IMAGE, () => {
    windows95.showDiskImage()
  })
}
