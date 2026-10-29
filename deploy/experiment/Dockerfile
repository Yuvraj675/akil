# Packages a prebuilt static binary from bin/ (built on the host: see run.sh).
FROM alpine:3.20
ARG BIN
COPY bin/${BIN} /usr/local/bin/app
ENTRYPOINT ["/usr/local/bin/app"]
