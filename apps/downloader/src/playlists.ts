import { join, relative } from "@std/path";
import { findFileByExt, IMAGE_EXTS, run } from "./lib.ts";

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumb: string | null;
  viewCount: number;
  playlistCount: number;
  videoIds: string[];
  modifiedDate: string | null;
}

export const getPlaylist = async (
  { playlistUrl, libraryDir }: { playlistUrl: string; libraryDir: string },
) => {
  const videoIdsPathArg = join(libraryDir, "%(playlist_id)s/video_ids.txt");
  const outputArg = join(libraryDir, "%(playlist_id)s/%(playlist_id)s.%(ext)s");
  const args = [
    "--skip-download",
    "--write-thumbnail",
    "--convert-thumbnails",
    "jpg",
    "--write-info-json",
    "--flat-playlist",
    "--print-to-file",
    "%(id)s",
    videoIdsPathArg,
    "-o",
    outputArg,
    playlistUrl,
  ];
  await run("yt-dlp", args);
};

export const buildPlaylist = async (
  { channelLabel, libraryDir }: {
    libraryDir: string;
    channelLabel: string | null;
  },
) => {
  const playlists: Playlist[] = [];

  for await (const entry of Deno.readDir(libraryDir)) {
    if (!entry.isDirectory) continue;

    const dir = join(libraryDir, entry.name);
    const files: string[] = [];
    for await (const f of Deno.readDir(dir)) {
      files.push(f.name);
    }

    const videoIdsFilePath = findFileByExt(files, [".txt"]);
    if (!videoIdsFilePath) continue;

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
    let videoIds: string[] = [];
    if (videoIdsFilePath) {
      try {
        videoIds = (await Deno.readTextFile(join(dir, videoIdsFilePath))).split(
          "\n",
        ).filter((ln) => !!ln);
      } catch {
        // ignore malformed info json; fall back to defaults below
      }
    }

    const rawDate = typeof info.modified_date === "string"
      ? info.modified_date
      : null;

    const modifiedDate = rawDate && /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : null;

    playlists.push({
      id: typeof info.id === "string" ? info.id : entry.name,
      title: typeof info.title === "string" ? info.title : entry.name,
      description: typeof info.description === "string" ? info.description : "",
      viewCount: typeof info.view_count === "number"
        ? Math.round(info.view_count)
        : 0,
      modifiedDate,
      playlistCount: typeof info.playlist_count === "number"
        ? Math.round(info.playlist_count)
        : 0,
      thumb: thumbFile ? relative(libraryDir, join(dir, thumbFile)) : null,
      videoIds,
    });
  }

  playlists.sort((a, b) =>
    (b.modifiedDate ?? "").localeCompare(a.modifiedDate ?? "")
  );

  const playlist = {
    version: 1,
    generatedAt: new Date().toISOString(),
    channel: channelLabel,
    playlists,
  };

  await Deno.writeTextFile(
    join(libraryDir, "playlists.json"),
    JSON.stringify(playlist, null, 2),
  );

  return playlist;
};
