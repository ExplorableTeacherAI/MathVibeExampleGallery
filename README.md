# MathVibe Example Gallery

A simple static gallery of published example lessons from the MathVibe user
studies, plus illustrative examples of the system's capabilities.

## Editing examples

Edit **`examples.js`** only. The 36 user-study cards (12 participants × 3
conditions) are generated automatically from the URL pattern
`https://c{n}-{full|no-edits|no-design}.mathvibe.space/`.

- **Lesson titles**: add entries to the `TITLES` map, keyed by subdomain
  (e.g. `"c3-no-edits": "Fractions on a Number Line"`). Cards without a title
  show the participant label.
- **Illustrative examples**: append entries to `ILLUSTRATIVE_EXAMPLES`.
- **Participant count / conditions / section labels**: change
  `PARTICIPANT_COUNT`, `CONDITIONS`, or `GROUPS` at the top of the file.

## Running locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

## Deploying (GitHub Pages)

1. Push to `main`.
2. On GitHub: **Settings → Pages → Source: Deploy from a branch**, branch
   `main`, folder `/ (root)`.

## Custom domain

The site is served at **https://examples.mathvibe.space/** (the `CNAME` file
in this repo, same setup as gallery.mathvibe.space). One-time setup:

1. In Cloudflare DNS for `mathvibe.space`, add a CNAME record:
   `examples` → `explorableteacherai.github.io`, **DNS only** (grey cloud).
2. On GitHub: **Settings → Pages → Custom domain** should show
   `examples.mathvibe.space` (picked up from the `CNAME` file); wait for the
   DNS check, then tick **Enforce HTTPS** once the certificate is issued.

## Live Project

https://examples.mathvibe.space/
