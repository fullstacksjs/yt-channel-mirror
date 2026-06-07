import { join, relative } from "@std/path";
import { run } from "./lib.ts";

interface GetPlaylistProps {
  channelUrl: string;
  libraryDir: string;
}
interface Playlist {
  id: string;
  title: string;
  description: string;
  thumb: string | null;
  viewCount: number;
  playlistCount: number;
  videoIds: string[];
  modifiedDate: string | null;
}

const getAllPlaylists = async (opts: GetPlaylistProps) => {
  const playlistIds = join(opts.libraryDir, "playlist-ids.txt");
  const args = [
    "--flat-playlist",
    "--print-to-file",
    "%(id)s",
    playlistIds,
    opts.channelUrl,
  ];
  await run("yt-dlp", args);
};

const getPlaylist = async (
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

const writePlaylistData = async (
  { libraryDir, channelUrl }: GetPlaylistProps,
) => {
  await getAllPlaylists({ channelUrl, libraryDir });
  const playlists = await Deno.readTextFile(
    join(libraryDir, "playlist-ids.txt"),
  );
  const getPlaylistPromise = playlists
    .split("\n")
    .filter((ln) => !!ln)
    .map(playListId => getPlaylist({
        libraryDir,
        playlistUrl: `https://www.youtube.com/playlist\?list\=${playlistId}`,
      }),
    );
  await Promise.all(getPlaylistPromise);
};

function findFileByExt(files: string[], exts: string[]): string | undefined {
  return files.find((f) => exts.some((e) => f.toLowerCase().endsWith(e)));
}
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

const buildPlaylist = async (
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
    videos: playlists,
  };

  await Deno.writeTextFile(
    join(libraryDir, "playlists.json"),
    JSON.stringify(playlist, null, 2),
  );

  return playlist;
};

await writePlaylistData({
  channelUrl: "https://www.youtube.com/@FullstacksJS/playlists",
  libraryDir: "./library/playlist",
});

await buildPlaylist({
  libraryDir: "./library/playlist",
  channelLabel: "FullstacksJS",
});
