export function setupCloseListener () {
  window.appState.isQuitting = false

  const handleClose = async () => {
    await windows95.saveState()
    window.appState.isQuitting = true
    windows95.quit()
  }

  window.onbeforeunload = (event) => {
    if (window.appState.isQuitting) return

    handleClose()
    event.preventDefault()
    event.returnValue = false
  }
}

export function setupEscListener () {
  document.onkeydown = function (evt) {
    evt = evt || window.event
    if (evt.keyCode === 27) {
      if (window.appState.cursorCaptured) {
        window.appState.cursorCaptured = false
        document.exitPointerLock()
      } else {
        window.appState.cursorCaptured = true
        window.emulator.lock_mouse()
      }
    }
  }
}

export function setupClickListener () {
  document.addEventListener('click', () => {
    if (!window.appState.cursorCaptured) {
      window.appState.cursorCaptured = true
      window.emulator.lock_mouse()
    }
  })
}
