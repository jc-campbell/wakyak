# syntax=docker/dockerfile:1.7
FROM node:24-bookworm AS libvips

ARG LIBVIPS_VERSION=8.18.3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl meson ninja-build pkg-config python3 \
    libexif-dev libexpat1-dev libffi-dev libgif-dev libglib2.0-dev \
    libheif-dev libjpeg62-turbo-dev liblcms2-dev liborc-0.4-dev \
    libpng-dev libtiff-dev libwebp-dev \
  && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://github.com/libvips/libvips/releases/download/v${LIBVIPS_VERSION}/vips-${LIBVIPS_VERSION}.tar.xz" -o /tmp/libvips.tar.xz \
  && tar -xJf /tmp/libvips.tar.xz -C /tmp \
  && meson setup /tmp/libvips-build "/tmp/vips-${LIBVIPS_VERSION}" --prefix=/usr/local --buildtype=release -Dmagick=disabled \
  && meson compile -C /tmp/libvips-build \
  && meson install -C /tmp/libvips-build

FROM libvips AS build
ARG LIBVIPS_VERSION=8.18.3
WORKDIR /app
RUN corepack enable
ENV SHARP_FORCE_GLOBAL_LIBVIPS=1 \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    PKG_CONFIG_PATH=/usr/local/lib/aarch64-linux-gnu/pkgconfig:/usr/local/lib/x86_64-linux-gnu/pkgconfig \
    LD_LIBRARY_PATH=/usr/local/lib/aarch64-linux-gnu:/usr/local/lib/x86_64-linux-gnu:/usr/local/lib
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json eslint.config.js ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --frozen-lockfile
RUN cd apps/api/node_modules/sharp \
  && NODE_PATH=/app/apps/api/node_modules PATH=/app/apps/api/node_modules/.bin:$PATH node install/build.js
COPY . .
RUN pnpm db:generate && pnpm build
RUN vips black /tmp/heic-source.v 16 16 --bands 3 \
  && vips heifsave /tmp/heic-source.v /tmp/hevc-probe.heic --compression hevc \
  && cd apps/api \
  && node -e "const sharp=require('sharp'); if (sharp.versions.vips !== '${LIBVIPS_VERSION}' || !sharp.format.heif.input.buffer) throw new Error('Sharp is not linked to the HEIF/HEIC-enabled system libvips'); sharp('/tmp/hevc-probe.heic').webp().toBuffer().then((body)=>console.log('Decoded real HEVC HEIC fixture', { vips: sharp.versions.vips, bytes: body.length })).catch((error)=>{ console.error(error); process.exit(1) })"

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libexif12 libexpat1 libffi8 libgif7 libglib2.0-0 libheif1 \
    libjpeg62-turbo liblcms2-2 liborc-0.4-0 libpng16-16 libtiff6 libwebp7 libwebpdemux2 libwebpmux3 \
    libmagickcore-6.q16-6 libopenexr-3-1-30 libopenjp2-7 librsvg2-2 openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=libvips /usr/local /usr/local
ENV NODE_ENV=production \
    LD_LIBRARY_PATH=/usr/local/lib/aarch64-linux-gnu:/usr/local/lib/x86_64-linux-gnu:/usr/local/lib \
    SHARP_FORCE_GLOBAL_LIBVIPS=1
WORKDIR /app
RUN corepack enable && corepack install --global pnpm@10.33.2
COPY --from=build /app /app
EXPOSE 4000
CMD ["sh", "-c", "API_HOST=0.0.0.0 API_PORT=${PORT:-4000} exec pnpm --filter @wakyak/api start"]
