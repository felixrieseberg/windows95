# windows95

This is Windows 95, running in an [Electron](https://electronjs.org/) app. Yes, it's the full thing. I'm sorry.

## Downloads

<table style="width: 100%">
<thead>
  <tr>
    <th>Type</th>
    <th>Windows</th>
    <th>macOS</th>
    <th>Linux</th>
  </tr>
</thead>
<tbody>
  <tr>
    <td>Standalone Download</td>
    <td>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-win32-ia32-2.3.0.zip">
        📦 Standalone, 32-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-win32-ia32-2.3.0.zip">
        📦 Standalone, 64-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-win32-ia32-2.3.0.zip">
        📦 Standalone, ARM64
      </a>
    </td>
    <td>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-darwin-arm64-2.3.0.zip">
        📦 Standalone, 64-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-darwin-x64-2.3.0.zip">
        📦 Standalone, ARM64
      </a>
    </td>
    <td></td>
  </tr>
  <tr>
    <td>Installers</td>
    <td>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-setup-ia32.exe">
        💿 Installer, 32-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-setup-x64.exe">
        💿 Installer, 64-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-setup-arm64.exe">
        💿 Installer, ARM64
      </a>
    </td>
    <td></td>
    <td>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-1.i386.rpm">
        💿 rpm, 32-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-1.x86_64.rpm">
        💿 rpm, 64-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-1.arm64.rpm">
        💿 rpm, ARM64
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95-2.3.0-1.arm64.rpm">
        💿 rpm, ARMv7 (armhf)
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95_2.3.0_i386.deb">
        💿 deb, 32-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95_2.3.0_amd64.deb">
        💿 deb, 64-bit
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95_2.3.0_arm64.deb">
        💿 deb, ARM64
      </a><br />
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v2.3.0/windows95_2.3.0_armhf.deb">
        💿 deb, ARMv7 (armhf)
      </a>
    </td>
  </tr>
</tbody>
</table>

![Screenshot](https://user-images.githubusercontent.com/1426799/44532591-4ceb3680-a6a8-11e8-8c2c-bc29f3bfdef7.png)

## Does it work?
Yes! Quite well, actually - on macOS, Windows, and Linux. Bear in mind that this is written entirely in JavaScript, so please adjust your expectations.

## Should this have been a native app?
Absolutely.

## Does it run Doom (or my other favorite game)?
You'll likely be better off with an actual virtualization app, but the short answer is yes. [Thanks to
@DisplacedGamers](https://youtu.be/xDXqmdFxofM) I can recommend that you switch to a resolution of
640x480 @ 256 colors before starting DOS games - just like in the good ol' days.

## Credits

99% of the work was done over at [v86](https://github.com/copy/v86/) by Copy.

## Contributing

Before you can run this from source, you'll need the disk image. It's not part of the
repository, but you can grab it using the `Show Disk Image` button from the packaged
release, which does include the disk image. You can find that button in the
`Modify C: Drive` section.

Unpack the `images` folder into the `src` folder, creating this layout:

```
- /images/windows95.img
- /images/default-state.bin
- /assets/...
- /bios/...
- /docs/...
```

Once you've done so, run `npm install` and `npm start` to run your local build.

## Other Questions

 * [MS-DOS seems to brick the screen](./HELP.md#ms-dos-seems-to-brick-the-screen)
 * [Windows 95 is stuck in a bad state](./HELP.md#windows-95-is-stuck-in-a-bad-state)
 * [I want to install additional apps or games](./HELP.md#i-want-to-install-additional-apps-or-games)
 * [Running in Docker](./docs/docker-instructions.md)
 * [Running in an online VM with Kubernetes and Gitpod](./docs/docker-kubernetes-gitpod.md)

## License

This project is provided for educational purposes only. It is not affiliated with and has
not been approved by Microsoft.
