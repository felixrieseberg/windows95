FROM --platform=linux/amd64 debian:bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl xz-utils ca-certificates make && \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/watcom && \
    curl -fsSL https://github.com/open-watcom/open-watcom-v2/releases/download/Current-build/ow-snapshot.tar.xz \
    | tar -xJ -C /opt/watcom
ENV WATCOM=/opt/watcom
ENV PATH=$WATCOM/binl64:$PATH
ENV INCLUDE=$WATCOM/h:$WATCOM/h/nt
ENV LIB=$WATCOM/lib386:$WATCOM/lib386/nt
WORKDIR /work
