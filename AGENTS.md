# LindyLoop contributor guide

Read [SPEC.md](SPEC.md) before changing behavior. Keep the client in `src/`
and the loopback API, SQLite, and media handling in `server/`; keep their
contracts small and explicit.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` for
affected changes. Browser behavior belongs in Playwright tests where practical.
Tests must set an isolated `LINDYLOOP_DATA_DIR`; never touch a user's library.

Do not add video bytes, SQLite files/WALs, uploads, logs with user data, or
secrets to Git. Do not expose arbitrary paths, bind beyond loopback, add CORS,
or replace transactional metadata operations with browser-only storage.
