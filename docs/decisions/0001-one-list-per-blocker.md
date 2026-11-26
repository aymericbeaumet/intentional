# 0001: One source, one compiled list per blocker

**Status:** accepted (2026-11)

## Context

uBlock Origin, AdGuard and Brave read similar but different filter syntaxes.
Filter-list preprocessors (`!#if`) look like the way to ship one file to all of
them, but they don't work across blockers:

- Brave's engine treats directives as comments, so both branches of an
  `!#if … !#else` apply.
- uBO evaluates AdGuard's `adguard_ext_*` identifiers as true, so AdGuard-only
  blocks leak into uBO.
- AdGuard rejects a whole list update on a malformed directive.

## Decision

- Contributors write **uBO syntax** (the largest contributor base) in
  `sites/<id>/rules.txt`.
- The build emits **one file per blocker**: uBO as written, AdGuard through
  AGTree's `convertToAdg`, Brave as uBO minus redirect scriptlets.
- `!#if ext_ublock | adguard | ext_brave` blocks are resolved at build time; any
  other identifier is a build error, so no directive ever reaches users.
- The build rejects rules that only some blockers understand (unlisted
  procedural operators, trusted scriptlets, `uritransform`, HTML filtering)
  unless they sit inside a target block.

## Consequences

- Subscribing is per blocker (the website picks the right URL).
- AGTree has no AdGuard → uBO converter; writing uBO syntax avoids needing one.
- uBO Lite users import the uBO file. uBO Lite only runs scriptlets it bundles,
  so our redirect scriptlets can't run there (redirects come from the
  userscript). uBO Lite isn't covered by the automated legs yet; check imports
  by hand after changing how redirects are emitted.
