const $ = document.querySelector.bind(document)

export function setupButtons (start) {
  // Start
  $('.btn-start').addEventListener('click', () => start())

  // Disk Image
  $('#show-disk-image').addEventListener('click', () => windows95.showDiskImage())

  // Reset
  $('#reset').addEventListener('click', () => windows95.resetState())

  $('#discard-state').addEventListener('click', () => {
    window.appState.bootFresh = true

    start('win95')
  })

  // Floppy
  $('#floppy').addEventListener('click', () => {
    $('#file-input').click()
  })

  // Floppy (Hidden Input)
  $('#file-input').addEventListener('change', (event) => {
    window.appState.floppyFile = event.target.files && event.target.files.length > 0
      ? event.target.files[0]
      : null

    if (window.appState.floppyFile) {
      $('#floppy-path').innerHTML = `Inserted Floppy Disk: ${window.appState.floppyFile.path}`
    }
  })
}

export function toggleButtons (forceTo) {
  const buttonElements = $('#buttons')

  if (buttonElements.style.display !== 'none' || forceTo === false) {
    buttonElements.style.display = 'none'
  } else {
    buttonElements.style.display = undefined
  }
}
