import { join, relative } from "@std/path";
import { type Catalog, CATALOG_VERSION, type VideoMeta } from "./video.ts";

export const VIDEO_EXTS = [".mp4", ".m4v", ".webm", ".mkv"];
export const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** Spawn a command, streaming its stdio to the parent. Resolves on exit code 0. */
export async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<void> {
  const command = new Deno.Command(cmd, {
    args,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    cwd: opts.cwd,
  });
  const child = command.spawn();
  const { code } = await child.status;
  if (code !== 0) throw new Error(`${cmd} exited with code ${code}`);
}

export async function checkBinary(cmd: string): Promise<boolean> {
  try {
    const command = new Deno.Command("test", {
      args: [cmd],
      stdout: "null",
      stderr: "null",
    });
    const { code } = await command.output();
    return code === 0;
  } catch {
    return false;
  }
}

export interface DownloadOptions {
  channelUrl: string;
  libraryDir: string;
  /** Limit to the N most recent videos (yt-dlp --playlist-end). */
  limit?: number;
}

/**
 * Download a channel's videos into the library as browser-native MP4 (H.264/AAC),
 * skipping anything already recorded in the download archive.
 */
export async function downloadChannel(opts: DownloadOptions): Promise<void> {
  const archive = join(opts.libraryDir, "archive.txt");

  const args = [
    // Browser-native first; fall back to any mp4, then anything, remuxing to mp4.
    "-f",
    "bv*[ext=mp4][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    // One folder per video id, predictable file stems.
    "-P",
    opts.libraryDir,
    "-o",
    "%(id)s/video.%(ext)s",
    // Metadata + thumbnail alongside the video.
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    // Idempotent re-runs.
    "--download-archive",
    archive,
    "--ignore-errors",
    "--no-overwrites",
  ];

  if (opts.limit && opts.limit > 0) {
    args.push("--playlist-end", String(opts.limit));
  }

  args.push(opts.channelUrl);

  await run("yt-dlp", args);
}

export function findFileByExt(
  files: string[],
  exts: string[],
): string | undefined {
  return files.find((f) => exts.some((e) => f.toLowerCase().endsWith(e)));
}

/** Scan the library folder and (re)build catalog.json from each video's info.json. */
export async function buildCatalog(
  libraryDir: string,
  channelLabel: string | null,
): Promise<Catalog> {
  const videos: VideoMeta[] = [];

  for await (const entry of Deno.readDir(libraryDir)) {
    if (!entry.isDirectory) continue;

    const dir = join(libraryDir, entry.name);
    const files: string[] = [];
    for await (const f of Deno.readDir(dir)) {
      files.push(f.name);
    }

    const videoFile = findFileByExt(files, VIDEO_EXTS);
    if (!videoFile) continue; // incomplete download, skip

    const infoFile = files.find((f) => f.endsWith(".info.json"));
    const thumbFile = findFileByExt(files, IMAGE_EXTS);

    let info: Record<string, unknown> = {};
    if (infoFile) {
      try {
        info = JSON.parse(await Deno.readTextFile(join(dir, infoFile)));
      } catch {
        // ignore malformed info json; fall back to defaults below
      }
    }

    const videoPath = join(dir, videoFile);
    const sizeBytes = (await Deno.stat(videoPath)).size;

    const rawDate = typeof info.upload_date === "string"
      ? info.upload_date
      : null;
    const uploadDate = rawDate && /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : null;

    videos.push({
      id: typeof info.id === "string" ? info.id : entry.name,
      title: typeof info.title === "string" ? info.title : entry.name,
      description: typeof info.description === "string" ? info.description : "",
      durationSec: typeof info.duration === "number"
        ? Math.round(info.duration)
        : 0,
      uploadDate,
      file: relative(libraryDir, videoPath),
      thumb: thumbFile ? relative(libraryDir, join(dir, thumbFile)) : null,
      sizeBytes,
    });
  }

  // Newest first when dates are known.
  videos.sort((a, b) => (b.uploadDate ?? "").localeCompare(a.uploadDate ?? ""));

  const catalog: Catalog = {
    version: CATALOG_VERSION,
    generatedAt: new Date().toISOString(),
    channel: channelLabel,
    videos,
  };

  await Deno.writeTextFile(
    join(libraryDir, "catalog.json"),
    JSON.stringify(catalog, null, 2),
  );

  return catalog;
}

export function ensureLibrary(libraryDir: string): void {
  try {
    Deno.statSync(libraryDir);
  } catch {
    throw new Error(`Library directory does not exist: ${libraryDir}`);
  }
}
