# Local-First English-Hindi IVR Demo

A browser-based prototype for the SuperAI Polaris assignment. The app simulates a double-sided IVR call where one caller speaks English and the other speaks Hindi. Speech capture and playback stay in the browser, while translation uses bundled local assets served by the static site.

## What the demo shows

- Two call legs: English caller and Hindi caller
- Push-to-talk voice capture for each leg
- Text fallback when speech recognition is unavailable
- Browser speech playback to the opposite caller's native language
- A reviewer panel with transcript, translation, routing, and state details
- A local-first architecture that can later swap browser APIs for sovereign on-device modules

## Tech approach

- `React 19` + `TypeScript` + `Vite`
- Browser Speech Recognition API for STT when supported
- Browser Speech Synthesis API for TTS when supported
- Bundled local translation assets for the demo
- Static frontend deployment on Cloudflare Pages

## Local development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the printed local URL in a Chromium-based browser.

## Production build

Create the production bundle:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Lint the project:

```bash
npm run lint
```

## GitHub Pages deployment

This project is configured to deploy through GitHub Actions.

1. Create a GitHub repository for this project.
2. Push the project to the `main` branch.
3. In the GitHub repository settings, open `Settings -> Pages`.
4. Set `Source` to `GitHub Actions`.
5. Push to `main` or run the `Deploy GitHub Pages` workflow manually.

The workflow file lives at:

- `.github/workflows/deploy-github-pages.yml`

For project repositories, the Vite base path is automatically set during GitHub Actions builds. For user-site repositories like `username.github.io`, the base stays `/`.

## Cloudflare Pages deployment

Install Wrangler if it is not already present in the project:

```bash
npm install -D wrangler@latest
```

Authenticate with Cloudflare:

```bash
npx wrangler login
```

Create a Pages project once:

```bash
npx wrangler pages project create local-first-ivr-demo
```

Deploy the built app:

```bash
npm run build
npx wrangler pages deploy dist --project-name local-first-ivr-demo
```

If you prefer a script-driven deploy after installing Wrangler:

```bash
npm run deploy:pages
```

## Browser compatibility

- Best experience: latest `Chrome`, `Edge`, or other Chromium-based browser
- Browser speech recognition support is inconsistent outside Chromium
- Speech synthesis voice availability depends on the browser and OS-installed voices
- If speech recognition is not available, the app shows a text-input fallback so the demo remains usable

## Demo limitations

- This v1 is a browser simulation, not a PSTN or SIP-connected IVR
- Translation now uses bundled local assets, but speech quality still depends on browser speech capabilities
- Speech quality and recognition accuracy vary by browser, microphone quality, and installed voices
- Hindi playback quality depends on whether the local system exposes a suitable Hindi voice

## Suggested next upgrade path

To move this closer to a sovereign production stack:

- replace browser STT with local ASR
- replace the public translation endpoint with local English-Hindi MT
- replace browser TTS with local Hindi and English TTS
- add Asterisk or FreeSWITCH for real telephony integration
