const $ = document.querySelector.bind(document)
const $$ = document.querySelectorAll.bind(document)

export function setupButtons (start) {
  // Sections
  $('a#start').addEventListener('click', () => setVisibleSection('start'))
  $('a#floppy').addEventListener('click', () => setVisibleSection('floppy'))
  $('a#state').addEventListener('click', () => setVisibleSection('state'))
  $('a#disk').addEventListener('click', () => setVisibleSection('disk'))

  // Start
  $('.btn-start').addEventListener('click', start)

  // Disk Image
  $('#disk-image-show').addEventListener('click', () => windows95.showDiskImage())

  // Reset
  $('#reset').addEventListener('click', () => windows95.resetState())

  $('#discard-state').addEventListener('click', () => {
    window.appState.bootFresh = true

    start()
  })

  // Floppy
  $('#floppy-select').addEventListener('click', () => {
    $('#floppy-input').click()
  })

  // Floppy (Hidden Input)
  $('#floppy-input').addEventListener('change', (event) => {
    window.appState.floppyFile = event.target.files && event.target.files.length > 0
      ? event.target.files[0]
      : null

    if (window.appState.floppyFile) {
      $('#floppy-path').innerHTML = `Inserted Floppy Disk: ${window.appState.floppyFile.path}`
    }
  })
}

export function toggleSetup (forceTo) {
  const buttonElements = $('#setup')

  if (buttonElements.style.display !== 'none' || forceTo === false) {
    buttonElements.style.display = 'none'
  } else {
    buttonElements.style.display = undefined
  }
}

function setVisibleSection(id = '') {
  $$(`section`).forEach((s) => s.classList.remove('visible'))
  $(`section#section-${id}`).classList.add('visible')
}
