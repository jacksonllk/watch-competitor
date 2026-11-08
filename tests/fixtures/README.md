# Test fixtures

A fixture is a saved API response. Tests read fixtures instead of calling the live context.dev API, so they spend no credits.

## Made-up data

`lib/fixtures/` holds responses for made-up companies (Acme Notes, Beta Minutes, Gamma Scribe). They are typed against the context.dev SDK, so `npm run typecheck` fails if the response shape changes. CI runs on these.

## Saved real responses

Real responses hold other sites' text, so they are **not in this repo**. They go in `tests/fixtures/local/`, which git ignores.

## Guards

- `.githooks/pre-commit` blocks any commit that adds files under `tests/fixtures/` other than this README. Turn it on once per clone: `git config core.hooksPath .githooks`.
- `tests/repo-guard.test.ts` fails if git tracks anything else here.
