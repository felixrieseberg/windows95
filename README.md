# windows95

This is Windows 95, running in an Electron app. Yes, it's the full thing. I'm sorry. [Download it here](https://github.com/felixrieseberg/windows95/releases).

![Screenshot](https://user-images.githubusercontent.com/1426799/44532591-4ceb3680-a6a8-11e8-8c2c-bc29f3bfdef7.png)

## Does it work?
Yes! Quite well, actually.

## Should this have been a native app?
Absolutely.

## Does it run Doom (or my other favorite game)?
You'll likely be better off with an actual virtualization app, but the short answer is yes. [Thanks to
@DisplacedGamers](https://youtu.be/xDXqmdFxofM) I can recommend that you switch to a resolution of 
640x480 @ 256 colors before starting DOS games - just like in the good ol' days.

## How's the code?
This only works well by accident and was mostly a joke. The code quality is accordingly.

## Credits

99.999% of the work was done over at [v86](https://github.com/copy/v86/) by Copy.

## Contributing

Before you can run this from source, you'll need the disk and state images. They're not part of the repo,
but [you can download them here](https://mega.nz/#!euxygQBT!i03vtE4kYTgrZ1rjZa1gT2F8hvhcwIAgGBsY4ECjs0w).

Unpack the `images` folder into the `src/renderer` folder, creating this layout:

```
./src/renderer/images/default-state.bin
./src/renderer/images/windows95.img
```

Once you've done so, run `npm install` and `npm start` to run your local build.

## License

This project is provided for educational purposes only. It is not affiliated with and has
not been approved by Microsoft.
