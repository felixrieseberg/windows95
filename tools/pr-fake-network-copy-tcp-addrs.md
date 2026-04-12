# fake_network: copy TCP connection addresses out of the NIC TX buffer

## Symptom

A `tcp-connection` handler that calls `conn.write()` asynchronously
(e.g. piping a real `net.Socket` into the guest) works at first, then
silently wedges as soon as the guest sends unrelated traffic. The guest
`recv()` blocks forever; a packet trace shows the guest answering each
data segment with RST.

## Cause

`handle_fake_tcp()` stores the connection's routing fields as

```js
conn.hsrc  = packet.eth.dest;
conn.psrc  = packet.ipv4.dest;
conn.hdest = packet.eth.src;
conn.pdest = packet.ipv4.src;
```

`packet` is parsed zero-copy from the frame the NIC handed to
`net0-send`. For `ne2k.js` that frame is
`this.memory.subarray(tpsr<<8, …)` — a view into the device's TX ring —
so `psrc` etc. are 4-/6-byte windows into NE2000 RAM.

When the guest later transmits anything to a different peer at the same
ring slot, those windows now read the new frame's addresses.
`TCPConnection.ipv4_reply()` then builds segments with the wrong source
IP (and a TCP checksum computed over it); the guest has no TCB for that
4-tuple and RSTs. Our `process()` never sees the RST (different tuple),
`pending` never clears, and the send buffer stalls.

This doesn't bite the built-in port-80 fetch handler in typical demos
because its replies usually arrive before the TX slot is reused, and on
guests whose driver uses a single TX page the headers happen to be
overwritten with identical values. With Win95's NE2000 driver (12-slot
TX ring) plus any concurrent traffic — SMB, NBNS, a background `ping` —
the slot is reused within a round-trip and every async reply is
mis-addressed.

## Fix

Copy the four address arrays when the `TCPConnection` is created. 20
bytes per accepted connection; the outbound-connect path already uses
the adapter's own stable arrays and is unaffected.

## Repro / verification

In a Win95 guest with `relay_url:"fetch"`, start `ping -t 8.8.8.8`,
then `telnet <any-ip> <port>` to a `tcp-connection` handler that
`accept()`s and writes ≥1 MSS after a `setTimeout`. Before: guest sends
RST when the data segment arrives. After: guest ACKs normally.
