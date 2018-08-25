import { setupState } from 'es6://app-state.js'
import { setupClickListener, setupEscListener, setupCloseListener } from 'es6://listeners.js'
import { toggleButtons, setupButtons } from 'es6://buttons.js'
import { setupInfo } from 'es6://info.js'

setupState()

/**
 * The main method executing the VM.
 */
async function main () {
  // New v86 instance
  window.emulator = new V86Starter({
    memory_size: 64 * 1024 * 1024,
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
      size: 242049024
    },
    fda: {
      buffer: window.appState.floppyFile || undefined
    },
    boot_order: 0x132
  })

  // High DPI support
  if (navigator.userAgent.includes('Windows')) {
    const scale = window.devicePixelRatio

    window.emulator.screen_adapter.set_scale(scale, scale)
  }

  // Restore state. We can't do this right away
  // and randomly chose 500ms as the appropriate
  // wait time (lol)
  setTimeout(async () => {
    if (!window.appState.bootFresh) {
      windows95.restoreState()
    }

    setupInfo()

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

setupEscListener()
setupCloseListener()
setupButtons(start)
