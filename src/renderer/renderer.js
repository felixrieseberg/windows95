const START_BUTTONS = document.querySelector('#start-buttons')

const OPTIONS = {
  win1: {
    fda: {
        url: './images/windows101.img',
        size: 1474560,
    }
  },
  win98: {
    hda: {
      url: './images/windows98.img',
      async: true,
      size: 300 * 1024 * 1024,
    }
  },
  win95: {
    hda: {
      url: './images/windows95.img',
      async: true,
      size: 242049024,
    }
  }
}

function main(id) {
  const opts = Object.assign({
    memory_size: 64 * 1024 * 1024,
    screen_container: document.getElementById('emulator'),
    bios: {
      url: './bios/seabios.bin',
    },
    vga_bios: {
        url: './bios/vgabios.bin',
    },
    autostart: true
  }, OPTIONS[id])

  console.log(opts, OPTIONS[id])

  window.emulator = new V86Starter(opts)
  window.emulator.lock_mouse()
}

function setupButtons() {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      START_BUTTONS.remove()
      document.body.className = '';
      main(btn.id)
    })
  })
}

setupButtons()
