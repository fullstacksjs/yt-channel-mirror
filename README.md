# Offline YouTube Channel Mirror

Download your YouTube channel on an internet-connected machine, copy the
`library/` folder to an offline box, and let your community browse and stream
videos from any browser.

## Prerequisites

- **Download machine**: [Deno 2+](https://deno.com),
  [`yt-dlp`](https://github.com/yt-dlp/yt-dlp#installation), and
  [`ffmpeg`](https://ffmpeg.org/download.html) on your PATH.
- **Offline server**: Docker + Docker Compose.

## How does this repo work?

```
 ┌─────────────────┐                       ┌───────────────────────────────────┐
 │                 │                       │                                   │
 │                 │                       │ Hell                              │
 │     Youtube     │                       │                                   │
 │                 │                       │                                   │
 │                 │                       │                                   │
 └────────▲────────┘                       │                                   │
          │                                │     ┌──────────────────┐          │
          │                                │     │                  │          │
Clone channel using CLI                    │     │      Server      │          │
          │                                │     │                  │          │
 ┌────────┴────────┐                       │     ├──────────────────┤          │
 │                 │                       │     │                  │          │
 │     Machine     │                       │     │     Machine      │          │
 │  With Internet  ├──────Smuggle─library──│────►│   W/O Internet   │          │
 │      Access     │                       │     │      Access      │          │
 │                 │                       │     │                  │          │
 └─────────────────┘                       │     └──────────────────┘          │
                                           │                                   │
                                           └───────────────────────────────────┘
```

## Download library for your channel

> [!WARNING]
> This step needs internet access, if you live in Iran and want to contribute
> you can download the
> [example archive](https://videos.fullstacksjs.com/files/example-library.tar.gz)
> instead.

The CLI is responsible for fetching videos from a Youtube channel. You can run
it on a machine with access to internet.

```bash
deno task oym-dl --channel "https://www.youtube.com/@YourChannel" --limit 20
```

Re-running only fetches new uploads (tracked via `library/archive.txt`).

Flags: `--out <dir>` (default `./library`), `--catalog-only` (rebuild index
without downloading).

## Copy the library to the server

```bash
scp -r ./library user@server:/opt/oym/library
```

## Run the server

```bash
docker compose up -d --build
```

Browse and watch. The server reloads `catalog.json` automatically when the file
changes.

## Development

Contributions are welcomed! Feel free to create an issue and open a PR.

Please format and lint code before committing using `deno fmt` and `deno lint`
You can also register git hooks to run those commands automatically when
committing and pushing by `deno task use-hooks`.

> [!IMPORTANT]
> Please do not make the tech stack complicated. The toolset for this project is
> intentionally kept as simple as possible. Feel free to make it even simpler if
> you can.
