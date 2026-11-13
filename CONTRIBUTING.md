# Contributing

Thanks for helping.

1. Fork the repo and clone your fork.
2. Run `npm install`, then `git config core.hooksPath .githooks` to turn on the commit guard.
3. Copy `.env.example` to `.env` and add your own context.dev key. Never commit `.env`.
4. Run `npm run dev` to start the app.
5. Run `npm test`, `npm run lint` and `npm run typecheck`. Tests never call the live API and spend no credits.
6. Open a pull request with a short note on what changed and why.

Saved API responses for tests follow the rules in [tests/fixtures/README.md](tests/fixtures/README.md). To remake the README's demo GIFs, see [demo/README.md](demo/README.md).

Keep changes small. Open an issue first for anything big.
