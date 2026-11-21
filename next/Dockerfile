FROM node:24-bookworm-slim AS browser
WORKDIR /source/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY desktop/src/linked/path-resolution.mjs /source/desktop/src/linked/path-resolution.mjs
RUN npm run next:browser

FROM rust:1.100.0-bookworm AS build
WORKDIR /source/next/src-tauri
COPY next/src-tauri/Cargo.toml next/src-tauri/Cargo.lock next/src-tauri/build.rs ./
COPY next/src-tauri/src/ ./src/
COPY backend/src/main/resources/static/access.* /source/backend/src/main/resources/static/
COPY --from=browser /source/frontend/dist-next-browser /source/frontend/dist-next-browser
RUN cargo build --locked --release --no-default-features --features host --bin vaultor-next-host

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 vaultor && useradd -u 10001 -g 10001 --no-create-home vaultor \
    && mkdir -p /data/workspace /data/access && chown -R 10001:10001 /data && chmod 0700 /data/access
COPY --from=build /source/next/src-tauri/target/release/vaultor-next-host /usr/local/bin/vaultor-next-host
USER 10001:10001
ENTRYPOINT ["vaultor-next-host"]
