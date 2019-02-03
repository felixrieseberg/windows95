const $ = document.querySelector.bind(document)
const status = $('#status')
const diskStatus = $('#disk-status')
const cpuStatus = $('#cpu-status')
const toggleStatus = $('#toggle-status')

let lastCounter = 0
let lastTick = 0
let infoInterval = null

const onIDEReadStart = () => {
  diskStatus.innerHTML = 'Read'
}

const onIDEReadWriteEnd = () => {
  diskStatus.innerHTML = 'Idle'
}

toggleStatus.onclick = toggleInfo

/**
 * Toggle the information display
 */
export function toggleInfo () {
  if (status.style.display !== 'none') {
    disableInfo()
  } else {
    enableInfo()
  }
}

/**
 * Start information gathering, but only if the panel is visible
 */
export function startInfoMaybe () {
  if (status.style.display !== 'none') {
    enableInfo()
  }
}

/**
 * Enable the gathering of information (and hide the little information tab)
 */
export function enableInfo () {
  // Show the info thingy
  status.style.display = 'block'

  // We can only do the rest with an emulator
  if (!window.emulator.add_listener) {
    return
  }

  // Set listeners
  window.emulator.add_listener('ide-read-start', onIDEReadStart)
  window.emulator.add_listener('ide-read-end', onIDEReadWriteEnd)
  window.emulator.add_listener('ide-write-end', onIDEReadWriteEnd)
  window.emulator.add_listener('screen-set-size-graphical', console.log)

  // Set an interval
  infoInterval = setInterval(() => {
    const now = Date.now()
    const instructionCounter = window.emulator.get_instruction_counter()
    const ips = instructionCounter - lastCounter
    const deltaTime = now - lastTick

    lastTick = now
    lastCounter = instructionCounter

    cpuStatus.innerHTML = Math.round(ips / deltaTime)
  }, 500)
}

/**
 * Disable the gathering of information (and hide the little information tab)
 */
export function disableInfo () {
  // Hide the info thingy
  status.style.display = 'none'

  // Clear the interval
  clearInterval(infoInterval)
  infoInterval = null

  // We can only do the rest with an emulator
  if (!window.emulator.remove_listener) {
    return
  }

  // Unset the listeners
  window.emulator.remove_listener('ide-read-start', onIDEReadStart)
  window.emulator.remove_listener('ide-read-end', onIDEReadWriteEnd)
  window.emulator.remove_listener('ide-write-end', onIDEReadWriteEnd)
  window.emulator.remove_listener('screen-set-size-graphical', console.log)
}
