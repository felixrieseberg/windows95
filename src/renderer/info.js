const $ = document.querySelector.bind(document)

export function setupInfo () {
  const diskStatus = $('#disk-status')
  const cpuStatus = $('#cpu-status')
  let lastCounter = 0
  let lastTick = 0

  window.emulator.add_listener('ide-read-start', () => {
    diskStatus.innerHTML = 'Read'
  })

  window.emulator.add_listener('ide-read-end', () => {
    diskStatus.innerHTML = 'Idle'
  })

  window.emulator.add_listener('ide-write-end', () => {
    diskStatus.innerHTML = 'Idle'
  })

  window.emulator.add_listener('screen-set-size-graphical', (...args) => {
    console.log(...args)
  })

  setInterval(() => {
    const now = Date.now()
    const instructionCounter = window.emulator.get_instruction_counter()
    const ips = instructionCounter - lastCounter
    const deltaTime = now - lastTick

    lastTick = now
    lastCounter = instructionCounter

    cpuStatus.innerHTML = Math.round(ips / deltaTime)
  }, 500)
}
