FROM rust:1.100.0-bookworm AS build
WORKDIR /source
COPY next/src-tauri/ ./
RUN cargo build --locked --release --no-default-features --features host --bin vaultor-next-host

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl +    && rm -rf /var/lib/apt/lists/* +    && groupadd -g 10001 vaultor && useradd -u 10001 -g 10001 --no-create-home vaultor +    && mkdir -p /data/workspace /data/access && chown -R 10001:10001 /data && chmod 0700 /data/access
COPY --from=build /source/target/release/vaultor-next-host /usr/local/bin/vaultor-next-host
USER 10001:10001
ENTRYPOINT ["vaultor-next-host"]
