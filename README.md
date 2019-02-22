# windows95

This is Windows 95, running in an [Electron](https://electronjs.org/) app. Yes, it's the full thing. I'm sorry.

## Downloads
|  | Windows | macOS | Linux |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Standalone Download | 📦[Standalone, 32-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-2.0.0-win32-standalone-ia32.zip) <br /> 📦[Standalone, 64-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-2.0.0-win32-standalone-x64.zip)  | 📦[Standalone](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-macos-2.0.0.zip) |  |
| Installer | 💽[Setup, 64-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-2.0.0-setup-win32-x64.exe) <br /> 💽[Setup, 32-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-2.0.0-setup-win32-ia32.exe)  |  |  💽[deb, 64-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-linux-2.0.0_amd64.deb) <br /> 💽[rpm, 64-bit](https://github.com/felixrieseberg/windows95/releases/download/v2.0.0/windows95-linux-2.0.0.x86_64.rpm) |

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

99.999% of the work was done over at [v86](https://github.com/copy/v86/) by Copy.

## Contributing

Before you can run this from source, you'll need the disk image. It's not part of the
repository, but you can grab it using the `Show Disk Image` button from the packaged
release, which does include the disk image.

Unpack the `images` folder into the `src` folder, creating this layout:

```
./src/images/windows95.img
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
