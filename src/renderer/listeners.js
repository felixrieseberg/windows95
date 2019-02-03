export function setupCloseListener () {
  window.appState.isQuitting = false

  const handleClose = async () => {
    await windows95.saveState()
    window.appState.isQuitting = true
    windows95.quit()
  }

  window.onbeforeunload = (event) => {
    if (window.appState.isQuitting) return
    if (window.appState.isResetting) return

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
        window.emulator.mouse_set_status(false)
        document.exitPointerLock()
      } else {
        window.appState.cursorCaptured = true
        window.emulator.lock_mouse()
      }
    }
  }
}

function onDocumentClick () {
  if (!window.appState.cursorCaptured) {
    window.appState.cursorCaptured = true
    window.emulator.mouse_set_status(true)
    window.emulator.lock_mouse()
  }
}

export function setupClickListener () {
  document.removeEventListener('click', onDocumentClick)
  document.addEventListener('click', onDocumentClick)
}
