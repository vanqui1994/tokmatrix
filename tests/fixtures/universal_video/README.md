# Universal video golden fixtures

This directory contains small, deterministic, offline inputs for tests of the
Universal Storyboard pipeline. The six SVG files are synthetic proxy frames,
not production footage. They deliberately avoid network resources, scripts,
fonts, credentials, and private source media.

`manifest.json` is the provenance and integrity ledger. `expectations.json`
contains renderer-neutral expected timing, speakers, entities, actions, and
honest fallback behavior. Its format is intentionally independent of the
Universal Storyboard v2 schema so it can remain a stable analysis oracle while
that schema evolves.

When a fixture is changed, update its SHA-256 in `manifest.json`. Any semantic
change also requires a review of the expected values and the fixture-format
version.
