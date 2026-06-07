#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write
import { resolve } from "@std/path";
import { parseArgs } from "@std/cli/parse-args";
import { buildCatalog, checkBinary, downloadChannel } from "./lib.ts";
import { buildPlaylist, getPlaylist } from "./playlists.ts";

interface Args {
  channel?: string;
  out: string;
  limit?: number;
  label?: string;
  catalogOnly: boolean;
  playlist?: string;
}

function parseCliArgs(argv: string[]): Args {
  const parsed = parseArgs(argv, {
    string: ["channel", "out", "limit", "label", "playlist"],
    boolean: ["catalog-only", "help"],
    alias: { c: "channel", o: "out", n: "limit", h: "help" },
    default: { out: "./library", "catalog-only": false },
    unknown: (arg) => {
      if (arg.startsWith("-")) {
        console.error(`Unknown option: ${arg}`);
        Deno.exit(1);
      }
      return true;
    },
  });

  if (parsed.help) {
    printHelp();
    Deno.exit(0);
  }

  const channel = parsed.channel ??
    (parsed._.length > 0 ? String(parsed._[0]) : undefined);

  return {
    channel,
    out: parsed.out,
    limit: parsed.limit !== undefined ? Number(parsed.limit) : undefined,
    label: parsed.label,
    catalogOnly: parsed["catalog-only"],
    playlist: parsed.playlist,
  };
}

function printHelp(): void {
  console.log(`
oym-download - download a YouTube channel into a self-hostable library

Usage:
  oym-download --channel <url> [--out ./library] [--limit N] [--label "My Channel"]
  oym-download --catalog-only --out ./library

Options:
  -c, --channel <url>   Channel / playlist / video URL to download
  -o, --out <dir>       Library output directory (default: ./library)
  -n, --limit <N>       Only fetch the N most recent videos
      --label <text>    Friendly channel name shown in the web UI
      --catalog-only    Skip downloading; just rebuild catalog.json from existing files
  -h, --help            Show this help

Requirements: yt-dlp and ffmpeg must be installed and on your PATH.
`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(Deno.args);
  const libraryDir = resolve(args.out);
  await Deno.mkdir(libraryDir, { recursive: true });

  const channelLabel = args.label ?? args.channel ?? null;

  if (args.playlist) {
    await getPlaylist({ libraryDir, playlistUrl: args.playlist });
    await buildPlaylist({ channelLabel, libraryDir });
    return;
  }

  if (!args.catalogOnly) {
    if (!args.channel) {
      console.error(
        "Error: --channel <url> is required (or use --catalog-only).",
      );
      printHelp();
      Deno.exit(1);
    }

    await ensureDependencies();

    console.log(`Downloading "${args.channel}" into ${libraryDir} ...`);
    await downloadChannel({
      channelUrl: args.channel,
      libraryDir,
      limit: args.limit,
    });
  }

  console.log("Building catalog.json ...");
  const catalog = await buildCatalog(
    libraryDir,
    channelLabel,
  );
  console.log(`Done. ${catalog.videos.length} video(s) in the library.`);
  console.log(
    `Copy the folder "${libraryDir}" to your server, then run docker compose up -d.`,
  );
}

function panic(msg: string): never {
  console.error(msg);
  Deno.exit(1);
}

async function ensureDependencies() {
  const [hasYtDlp, hasFfmpeg] = await Promise.all([
    checkBinary("yt-dlp"),
    checkBinary("ffmpeg"),
  ]);

  if (!hasYtDlp) {
    panic(
      "Error: yt-dlp not found on PATH. Install it: https://github.com/yt-dlp/yt-dlp#installation",
    );
  }

  if (!hasFfmpeg) {
    panic(
      "Error: ffmpeg not found on PATH. Install it: https://ffmpeg.org/download.html",
    );
  }
}

try {
  await main();
} catch (err) {
  panic(err instanceof Error ? err.message : String(err));
}
