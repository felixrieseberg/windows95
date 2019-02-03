/* We're using modern esm imports here */
import { setupState } from 'es6://app-state.js'
import { setupClickListener, setupEscListener, setupCloseListener } from 'es6://listeners.js'
import { toggleButtons, setupButtons } from 'es6://buttons.js'
import { startInfoMaybe } from 'es6://info.js'
import { setupIpcListeners } from 'es6://ipc.js'

setupState()

/**
 * The main method executing the VM.
 */
async function main () {
  const imageSize = await window.windows95.getDiskImageSize()
  const options = {
    memory_size: 128 * 1024 * 1024,
    video_memory_size: 32 * 1024 * 1024,
    screen_container: document.getElementById('emulator'),
    bios: {
      url: './bios/seabios.bin'
    },
    vga_bios: {
      url: './bios/vgabios.bin'
    },
    hda: {
      url: '../images/windows95.img',
      async: true,
      size: imageSize
    },
    fda: {
      buffer: window.appState.floppyFile || undefined
    },
    boot_order: 0x132
  }

  console.log(`Starting emulator with options`, options)

  // New v86 instance
  window.emulator = new V86Starter(options)

  // Restore state. We can't do this right away
  // and randomly chose 500ms as the appropriate
  // wait time (lol)
  setTimeout(async () => {
    if (!window.appState.bootFresh) {
      windows95.restoreState()
    }

    startInfoMaybe()

    window.appState.cursorCaptured = true
    window.emulator.lock_mouse()
    window.emulator.run()
  }, 500)
}

function start () {
  document.body.className = ''

  toggleButtons(false)
  setupClickListener()
  main()
}

setupIpcListeners(start)
setupEscListener()
setupCloseListener()
setupButtons(start)

if (document.location.hash.includes('AUTO_START')) {
  start()
}
