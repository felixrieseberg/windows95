const $ = document.querySelector.bind(document)
const $$ = document.querySelectorAll.bind(document)

const BUTTONS = $('#buttons')

let cursorCaptured = false
let floppyFile = null
let bootFresh = false

const OPTIONS = {
  win95: {
    hda: {
      url: './images/windows95.img',
      async: true,
      size: 242049024
    }
  }
}

async function main (id) {
  const opts = Object.assign({
    memory_size: 64 * 1024 * 1024,
    screen_container: document.getElementById('emulator'),
    bios: {
      url: './bios/seabios.bin'
    },
    vga_bios: {
      url: './bios/vgabios.bin'
    },
    fda: {
      buffer: floppyFile || undefined
    },
    boot_order: 0x132
  }, OPTIONS[id])

  // New v86 instance
  window.emulator = new V86Starter(opts)

  // Restore state. We can't do this right away.
  setTimeout(async () => {
    if (!bootFresh) {
      await windows95.restoreState()
    }

    cursorCaptured = true
    window.emulator.lock_mouse()
    window.emulator.run()
  }, 500)
}

function start (id) {
  BUTTONS.remove()
  document.body.className = ''
  main(id)
}

function setupButtons () {
  // Start
  $$('.btn-start').forEach((btn) => {
    btn.addEventListener('click', () => start(btn.id))
  })

  // Reset
  $('#reset').addEventListener('click', () => {
    if (window.emulator.stop) {
      window.emulator.stop()
    }

    windows95.resetState()

    if (window.emulator.run) {
      window.emulator.run()
    }

    $('#reset').disabled = true
  })

  $('#discard-state').addEventListener('click', () => {
    bootFresh = true

    start('win95')
  })

  // Floppy
  $('#floppy').addEventListener('click', () => {
    $('#file-input').click()
  })

  // Floppy (Hidden Input)
  $('#file-input').addEventListener('change', (event) => {
    floppyFile = event.target.files && event.target.files.length > 0
      ? event.target.files[0]
      : null

    if (floppyFile) {
      $('#floppy-path').innerHTML = `Inserted Floppy Disk: ${floppyFile.path}`
    }
  })
}

function setupEscListener () {
  document.onkeydown = function (evt) {
    evt = evt || window.event
    if (evt.keyCode === 27) {
      if (cursorCaptured) {
        cursorCaptured = false
        document.exitPointerLock()
      } else {
        cursorCaptured = true
        window.emulator.lock_mouse()
      }
    }
  }
}

function setupCloseListener () {
  let isQuitting = false

  const handleClose = async () => {
    await windows95.saveState()
    isQuitting = true
    windows95.quit()
  }

  window.onbeforeunload = (event) => {
    if (isQuitting) return

    handleClose()
    event.preventDefault()
    event.returnValue = false
  }
}

setupEscListener()
setupCloseListener()
setupButtons()
