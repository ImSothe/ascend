# Ascend

A gym progression tracker that treats training like a role-playing game: each
session is a daily mission, each logged set earns experience, and ranks from E
to S take years of consistent work to reach.

**Live:** https://imsothe.github.io/ascend/

It is a mobile-first PWA with no framework and no build step. It works offline
and without an account; signing in with Google adds a cloud copy that follows
you across devices.

## Why

Most people who stall in the gym do not lack effort, they lack a record: without
knowing what was lifted last week there is nothing to beat this week. Ascend
makes the record the game. The app decides, from the last session, whether
today's load goes up or stays, and turns consistency into something visible.

## What it does

- **Mission**: the next session of a 4-day split with two muscle groups per
  day (chest + triceps, back + biceps, legs + abs, shoulders + hamstrings),
  with sets, rep range and reps in reserve for every exercise.
- **Starting point**: a starting rank and a starting load per exercise, set in
  the app and used until the first real record.
- **Load protocol**: double progression. If every set reaches the top of the
  rep range, the load goes up by the smallest increment next time. Inside the
  range the target is one more rep. Below the range the load stays and the
  lowering phase slows down.
- **Rest control**: every exercise states how long to rest and why. The time
  can be adjusted per exercise and is remembered. A countdown starts when a set
  is checked (or by hand), can be shortened or extended, and beeps at zero.
- **Experience**: 10 XP per set, 30 per earned load increase, 100 for finishing
  every set of the mission. Level `n` needs `100 × (n − 1)²` XP.
- **Road**: the rank ladder with the XP, missions and weeks left to the next
  rank, and a strength trend (estimated one-rep max) for every exercise.
- **Status**: four stat bars derived from the log (upper-body loads, lower-body
  loads, weekly volume, consistency) and a body-weight log.
- **Log**: month calendar and session history. Export and import as JSON.

The streak counts consecutive weeks with all four missions done, not days: a
gym plan has rest days, and a daily streak would punish them.

## Cloud copy

Local-first: the app never waits for the network. Sign-in is optional and the
Firebase SDK is only downloaded when the account card is opened.

- **Sync** (`app/core/merge.js`, `app/data/cloud.js`): pull what changed, merge,
  push only the difference. The newest edit wins per session, deletions travel
  as tombstones, and a failed upload stays marked for the next try. The merge is
  a pure function, tested with two simulated devices.
- **Rules** (`firestore.rules`): a signed-in person can read and write their own
  documents and nothing else; every write is shape-checked. A test keeps the
  fields the app sends in step with the fields the rules allow.
- **Nothing from the cloud is trusted**: remote records go through the same
  sanitiser as an imported file before they reach the state.
- **CSP**: `default-src 'none'`, no inline script or style; the DOM is built
  without HTML strings.

The cloud copy is not end-to-end encrypted: it is protected by the Google
account and the rules above, and the administrator of the Firebase project can
read it.

## Run it

```
npm run dev      # http://localhost:8791/
npm test         # node --test, no dependencies
```

## Layout

```
app/core/        pure logic, covered by tests
  program.js     the training programme
  progression.js double progression and estimated 1RM
  player.js      XP, levels, ranks, streak, stats
  store.js       state shape, sanitising, mutations
  merge.js       merge of local and cloud data
app/data/        Firebase configuration and the sync module
app/app.js       interface
app/vendor/      Firebase web SDK, vendored (see README.txt there)
tests/           node:test suite
```

## Status

Version 0.2. The programme is defined in code and is not editable in the app
yet; starting loads are personal data and live in each person's state.

Checked in Chromium at a phone viewport. The sign-in window opens Google's
account page without CSP violations, and Firestore refuses anonymous reads and
writes. Not yet verified: a complete sign-in and sync with a real account, a
real iPhone or Android device, and the rules against the Firestore emulator.

The rank and stat numbers are a game layer, not a fitness assessment.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md). The Firebase SDK in `app/vendor` is
Apache 2.0. Built with Claude Code.
