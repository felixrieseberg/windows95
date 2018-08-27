# Running windows95 in Docker

## Display using a volume mount of the host X11 Unix Socket (Linux Only):

**Requirements:**
* Linux OS with a running X-Server Display
* [Docker](http://docker.io) 

        docker run -it -v /tmp/.X11-unix:/tmp/.X11-unix -e DISPLAY=unix$DISPLAY --device /dev/snd --name windows95 toolboc/windows95


Note: You may need to run `xhost +` on your system to allow connections to the X server running on the host.

## Display using Xming X11 Server over tcp Socket (Windows and beyond):

**Requirements:**
* [Xming](https://sourceforge.net/projects/xming/)
* [Docker](http://docker.io) 

1. Start the Xming X11 Server
2. Obtain the ip of the host machine running the Xming server
3. Edit X0.hosts (Located in the install directory of Xming) by adding the ip of the host machine obtained in step 2
4. Run the command below and replace the `<XmingServerHostIp>` placeholder with the ip from step 2

        docker run -it -e DISPLAY=<XmingServerHostIp> --name windows95 toolboc/windows95
