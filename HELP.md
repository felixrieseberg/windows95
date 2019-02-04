# Help & Commonly Asked Questions

## MS-DOS seems to brick the screen
Hit `Alt + Enter` to make the command screen "full screen" (as far as Windows 95 is
concerned). This should restore the display from the garbled mess you see and allow
you to access the command prompt. Press Alt-Enter again to leave full screen and go
back to a window mode. (Thanks to @DisplacedGamer for that wisdom)

## Windows 95 is stuck in a bad state

Restart the application and click on the "Reset machine & delete state" button.
You can find it in the lower left of the screen. Then, hit the "Start Windows 95"
button to start your virtual machine again.

## I want to install additional apps or games

If you are running macOS, or Linux, you can probably "mount" the
virtual hard drive used by `windows95` to add files. Hit the "Show Disk Image"
button in the lower right of the app, which will take you to the disk image.

On macOS, double-click the disk image to open it.

On Windows 10, Windows will _think_ that it can open up the image, but will
actually fail to do so. Use a tool [like OSFMount][osfmount] to mount your 
disk image.

On Linux, search the Internet for instructions on how to mount an `img` disk
image on your distribution. It's likely that you'll be able to run `mount`
with the image as input.

[osfmount]: https://www.osforensics.com/tools/mount-disk-images.html

## What's the FrontPage Username and Password?
Username: windows95
Password: password
