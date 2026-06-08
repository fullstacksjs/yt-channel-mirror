import { join } from "@std/path";

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

export interface PlaylistArchive {
  version: number;
  generatedAt: string;
  channel: string | null;
  playlists: Playlist[];
}

export class PlaylistStore {
  #playlists: PlaylistArchive | null = null;
  #mtimeMs = 0;
  #byId = new Map<string, Playlist>();
  readonly #libraryDir: string;

  constructor(libraryDir: string) {
    this.#libraryDir = libraryDir;
  }

  get #playlistArchivePath(): string {
    return join(this.#libraryDir, "playlists.json");
  }

  async #refreshIfStale(): Promise<void> {
    let mtimeMs: number;
    try {
      mtimeMs = (await Deno.stat(this.#playlistArchivePath)).mtime?.getTime() ??
        0;
    } catch {
      this.#playlists = {
        version: 1,
        generatedAt: "",
        channel: null,
        playlists: [],
      };
      this.#byId.clear();
      return;
    }
    if (this.#playlists && mtimeMs === this.#mtimeMs) return;

    const raw = await Deno.readTextFile(this.#playlistArchivePath);
    const parsed = JSON.parse(raw) as PlaylistArchive;
    this.#playlists = parsed;
    this.#mtimeMs = mtimeMs;
    this.#byId = new Map(parsed.playlists.map((v) => [v.id, v]));
  }

  async getPlaylists(): Promise<PlaylistArchive> {
    await this.#refreshIfStale();
    return this.#playlists!;
  }

  async getById(id: string): Promise<Playlist | undefined> {
    await this.#refreshIfStale();
    return this.#byId.get(id);
  }
}
