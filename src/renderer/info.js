export function setupInfo() {
  window.appState.infoInterval = setInterval(() => {
    if (window.emulator && window.emulator.get_statistics) {}
  })
}
