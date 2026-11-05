# AuraOS — Web Desktop

A browser-native desktop environment for your sandbox: a real window manager,
a terminal wired to an actual bash shell, a file manager, an editor, a system
monitor — and a browser that browses the real web through a built-in proxy.

No frameworks were harmed: Next.js + React + Tailwind + shadcn/ui on the
front, Next route handlers on the back. Zero chart libs (canvas by hand),
zero window-manager libs (drag/resize/snap by hand).

## Apps

| App | What it does |
| --- | --- |
| **Terminal** | Real bash via a sandboxed exec API — `ls`, `git`, `python`, anything the sandbox has |
| **Files** | Browse/create/rename/delete over the real filesystem, breadcrumbs, places sidebar |
| **Browser** | The actual web: pages are fetched server-side by `/api/proxy`, frame-blocking headers stripped, links rewritten so navigation stays in the desktop. Proxy ⇄ Direct mode toggle |
| **Editor** | View & edit files in place |
| **System Monitor** | CPU / RAM / load / top processes + hand-drawn canvas charts, live FPS |
| **Tier 1** | Vendored applet: [CodeRegister/tier-1](https://github.com/CodeRegister/tier-1) — memory training gym (encoding drills, palace builder, link chains, exam). All 20 of its sanity tests pass |
| **Settings** | Wallpapers, accent colors, FPS overlay |

Desktop features: boot screen, taskbar with live clock + FPS, start menu with
app search, right-click context menu, window snapping (drag to edges,
double-click title bar to maximize), z-order cycling, notifications, and a
60 fps target you can watch in the corner.

## Run it

```bash
bun install            # or npm install
bun run db:push        # prisma schema → sqlite (db/custom.db)
bun run dev            # http://localhost:3000
```

The sandbox APIs the desktop talks to:

- `POST /api/terminal` — exec a command in the real shell
- `GET/POST /api/fs/*` — list / read / write / operations on the filesystem
- `GET /api/system` — CPU, memory, uptime, top processes
- `GET|POST /api/proxy?url=…` — the browser's web proxy (SSRF-guarded:
  private/loopback targets rejected, 8 MB cap, 15 s timeout)

## Structure

```
src/components/os/        desktop shell: window manager, taskbar, start menu
src/components/os/apps/   one file per app (terminal, browser, files, …)
src/lib/os/               state (zustand), fs/system APIs, fps meter
src/app/api/              route handlers: terminal, fs, system, proxy
public/tier1/             vendored Tier 1 applet (MIT, see its LICENSE)
```

## Notes

- The Browser's proxy renders pages through this origin so frame-blocking
  sites (GitHub et al.) load inside the desktop; JS-heavy sites degrade
  gracefully — flip to **Direct** mode for embeddable sites, and expect some
  (Wikipedia, DuckDuckGo) to refuse cloud IPs outright.
- Everything stays inside your sandbox. No telemetry, no external accounts.
