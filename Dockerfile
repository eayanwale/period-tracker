# better-sqlite3 needs native compilation (node-gyp) -- build it in a
# stage with the toolchain, then copy just the finished node_modules
# into a slim runtime image so the final image doesn't carry gcc/python.
FROM node:20-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY server/ .
COPY frontend/ ./public
# Not part of the served app -- a one-off icon-generation script and the
# local test runner for cycle.js, neither needed at runtime.
RUN rm -f ./public/icons/generate_icons.py ./public/js/test-cycle.mjs

ENV DB_PATH=/data/period-tracker.db
EXPOSE 3000
CMD ["node", "index.js"]
