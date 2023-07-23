# windows95

Esto es Windows 95, ejecutandose en una app [Electron](https://electronjs.org/). Si, esto es todo. Lo siento.

## Downloads

<table class="is-fullwidth">
</thead>
<tbody>
</tbody>
  <tr>
    <td>
      <img src="./.github/images/windows.png" width="24"><br />
      Windows
    </td>
    <td>
      <span>32-bit</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-setup-ia32.exe">
        💿 Installer
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-win32-ia32-3.1.1.zip">
        📦 Standalone Zip
      </a>
      <br />
      <span>64-bit</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-setup-x64.exe">
        💿 Installer
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-win32-x64-3.1.1.zip">
        📦 Standalone Zip
      </a><br />
      <span>ARM64</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-setup-arm64.exe">
        💿 Installer
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-win32-arm64-3.1.1.zip">
        📦 Standalone Zip
      </a><br />
      <span>
        ❓ No sabes que tipo de chip tienes? Preciona inicio, introduce "procesador" para ver la información.
      </span>
    </td>
  </tr>
  <tr>
    <td>
      <img src="./.github/images/macos.png" width="24"><br />
      macOS
    </td>
    <td>
      <span>Intel Processor</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-darwin-x64-3.1.1.zip">
        📦 Standalone Zip
      </a><br />
      <span>Apple M1 Processor</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-darwin-arm64-3.1.1.zip">
        📦 Standalone Zip
      </a><br />
      <span>
        ❓ No sabes que chip tienes? Puedes leer mas aqui <a href="https://support.apple.com/en-us/HT211814">apple.com</a>.
      </span>
    </td>
  </tr>
  <tr>
    <td>
      <img src="./.github/images/linux.png" width="24"><br />
      Linux
    </td>
    <td>
      <span>64-bit</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-1.x86_64.rpm">
        💿 rpm
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95_3.1.1_amd64.deb">
        💿 deb
      </a><br />
      <span>ARM64</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-1.arm64.rpm">
        💿 rpm
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95_3.1.1_arm64.deb">
        💿 deb
      </a><br />
      <span>ARMv7 (armhf)</span>
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95-3.1.1-1.armv7hl.rpm">
        💿 rpm
      </a> |
      <a href="https://github.com/felixrieseberg/windows95/releases/download/v3.1.1/windows95_3.1.1_armhf.deb">
        💿 deb
      </a>
    </td>
  </tr>
</table>

<hr />

![Screenshot](https://user-images.githubusercontent.com/1426799/44532591-4ceb3680-a6a8-11e8-8c2c-bc29f3bfdef7.png)

## ¿Esto funciona?
Si! Bastante bien, actualmente - en macOS, Windows, y Linux. Tenga en cuenta que esto esta escrito completamente en JavaScript, asi que por favor ajustar las expectativas.

## ¿Deberias haber sido una aplicacion nativa?
Definitivamente.

## ¿Puedo correr Doom (o otro de mis juegos favoritos)?
Es probable que te vaya mejor con una aplicación de virtualización real, pero la respuesta corta es si. [Gracias a
@DisplacedGamers](https://youtu.be/xDXqmdFxofM) Puedo recomendar que usen una resolución de 
640x480 @ 256 colores antes de comenzar juegos DOS - como en los viejos tiempos.

## Credits

99% of the work was done over at [v86](https://github.com/copy/v86/) by Copy aka Fabian Hemmer and his contributors.

## Contributing

Antes de que puedas ejecutar el proyecto desde el source, necesitarás la imagen de disco. 
Esto no forma parte del repositorio, pero puede obtenerlo 
usando el boton `Show Disk Image` de el paquete liberado, el cual incluye dicha imagen . Puede encontrar ese botón en la sección `Modify C: Drive`.

Descomprima la carpeta `images` dentro de la carpeta `src` folder, creando este layout:

```
- /images/windows95.img
- /images/default-state.bin
- /assets/...
- /bios/...
- /docs/...
```

Una vez que este listo, ejecute `npm install` y `npm start` para ejecutar la build local.

Si desea modificar la imagen o crear una nueva, consulte la página [QEMU docs](./docs/qemu.md).

## Otras preguntas

 * [MS-DOS parece bloquear la pantalla](./HELP.md#ms-dos-seems-to-brick-the-screen)
 * [Windows 95 está atascado en un bad state](./HELP.md#windows-95-is-stuck-in-a-bad-state)
 * [Quiero instalar apps o juegos adicionales](./HELP.md#i-want-to-install-additional-apps-or-games)
 * [Ejecución in Docker](./docs/docker-instructions.md)
 * [Ejecución en una máquina virtual en línea con Kubernetes y Gitpod](./docs/docker-kubernetes-gitpod.md)

## Licencia

Este proyecto se ofrece únicamente con fines educativos. No está afiliado con, ni ha sido aprobado por Microsoft.
s