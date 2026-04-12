# Build W95TOOLS.EXE for Windows 95 with Open Watcom v2, inside Docker.
#
# Watcom is the only readily-available cross-compiler that emits a PE binary
# Win95 RTM will load (subsystem 4.0, no msvcrt). mingw-w64 targets NT. The
# macOS-native Watcom binaries are unsigned and Gatekeeper kills them, so we
# run the linux/amd64 build under Docker instead.

IMAGE  := windows95-ow2
# Docker Desktop's bind-mount file sync races with recently-edited files; work
# around it by piping the source on stdin and building in /tmp inside the
# container, then dumping the EXE bytes back over stdout.
DOCKER := docker run --rm -i --platform linux/amd64 $(IMAGE)
CFLAGS := -bt=nt -3r -zq -wx -we -os -s

.PHONY: all image clean

all: W95TOOLS.EXE

image:
	docker build --platform linux/amd64 -t $(IMAGE) .

W95TOOLS.EXE: w95tools.c image
	$(DOCKER) sh -c 'cd /tmp && cat >w95tools.c && \
	  wcc386 $(CFLAGS) w95tools.c && \
	  wlink system nt_win option quiet name W95TOOLS.EXE \
	    file w95tools.o library kernel32,user32 && \
	  cat W95TOOLS.EXE' <w95tools.c >$@

clean:
	rm -f W95TOOLS.EXE
