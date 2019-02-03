export function setupState () {
  window.appState = {
    isResetting: false,
    isQuitting: false,
    cursorCaptured: false,
    floppyFile: null,
    bootFresh: false
  }
}
