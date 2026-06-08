import { Application, Router, send } from "oak";
// @ts-expect-error: no types for handlebars yet
import { Handlebars } from "handlebars";
import { join, resolve } from "@std/path";
import { CatalogStore } from "./catalog.ts";
import { loadConfig } from "./config.ts";
import { PlaylistStore } from "./playlists.ts";

const dirname = import.meta.dirname!;
const { hostname, port, libraryDir } = loadConfig();
const playlistLibraryPath = join(join(libraryDir, "/playlists"));
const store = new CatalogStore(libraryDir);
const playlistStore = new PlaylistStore(playlistLibraryPath);

function formatDuration(sec: number): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function formatDate(date: string | null): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const handle = new Handlebars({
  baseDir: resolve(dirname, "views"),
  extname: ".hbs",
  layoutsDir: "layouts/",
  partialsDir: "partials/",
  defaultLayout: "main",
  helpers: {
    formatDuration,
    formatDate,
    eq: (a: unknown, b: unknown) => a === b,
  },
  compilerOptions: undefined,
});

type SortKey = "newest" | "oldest" | "title";

const router = new Router();

router.use(async (ctx, next) => {
  ctx.state.currentPath = ctx.request.url.pathname;

  await next();
});

router.get("/api/health", (ctx) => {
  ctx.response.body = { ok: true };
});

router.get("/", async (ctx) => {
  const params = ctx.request.url.searchParams;
  const query = (params.get("q") ?? "").trim();
  const sort = (params.get("sort") ?? "newest") as SortKey;

  const catalog = await store.getCatalog();
  const q = query.toLowerCase();
  const videos = q
    ? catalog.videos.filter((v) => v.title.toLowerCase().includes(q))
    : [...catalog.videos];

  videos.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    const da = a.uploadDate ?? "";
    const db = b.uploadDate ?? "";
    return sort === "newest" ? db.localeCompare(da) : da.localeCompare(db);
  });

  ctx.response.type = "text/html";
  ctx.response.body = await handle.renderView("gallery", {
    title: "FullstacksJS - Video Library",
    count: catalog.videos.length,
    videos,
    query,
    sort,
  });
});

router.get("/watch/:id", async (ctx) => {
  const video = await store.getById(ctx.params.id);
  if (!video) {
    ctx.response.status = 404;
    ctx.response.type = "text/html";
    ctx.response.body = await handle.renderView("notfound", {
      title: "Not found",
    });
    return;
  }
  ctx.response.type = "text/html";
  ctx.response.body = await handle.renderView("watch", {
    title: video.title,
    video,
  });
});

router.get("/media/:id/video", async (ctx) => {
  const video = await store.getById(ctx.params.id);
  if (!video) {
    ctx.response.status = 404;
    ctx.response.body = "not found";
    return;
  }
  await send(ctx, video.file, { root: libraryDir });
});

router.get("/media/:id/thumb", async (ctx) => {
  const video = await store.getById(ctx.params.id);
  if (!video || !video.thumb) {
    ctx.response.status = 404;
    ctx.response.body = "not found";
    return;
  }
  await send(ctx, video.thumb, { root: libraryDir });
});

router.get("/playlists", async (ctx) => {
  const playlists = await playlistStore.getPlaylists();
  ctx.response.type = "text/html";
  ctx.response.body = await handle.renderView("playlists", {
    title: "FullstacksJS - Video Library",
    playlists: playlists.playlists,
  });
});

router.get("/playlists/:id", async (ctx) => {
  const playlist = await playlistStore.getById(ctx.params.id);
  if (!playlist || !playlist.videoIds) {
    ctx.response.status = 404;
    ctx.response.body = "not found";
    return;
  }
  const catalog = await store.getCatalog();
  const videos = catalog.videos.filter((v) => playlist.videoIds.includes(v.id));

  ctx.response.type = "text/html";
  ctx.response.body = await handle.renderView("playlist", {
    count: videos.length,
    description: playlist.description,
    title: playlist.title,
    id: playlist.id,
    actualVideoCount: playlist.videoIds.length,
    videos,
  });
});

router.get("/media/:id/playlists/thumb", async (ctx) => {
  const playlist = await playlistStore.getById(ctx.params.id);
  if (!playlist || !playlist.thumb) {
    ctx.response.status = 404;
    ctx.response.body = "not found";
    return;
  }
  await send(ctx, playlist.thumb, { root: playlistLibraryPath });
});

router.get("/static/:path+", async (ctx) => {
  if (!ctx.params.path) {
    ctx.response.status = 404;
    return;
  }

  if (ctx.params.path.includes("..")) {
    ctx.response.status = 404;
    return;
  }

  await send(ctx, ctx.params.path, { root: resolve(dirname, "static") });
});

const app = new Application();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    ctx.response.status = 500;
    ctx.response.body = "internal error";
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`Library: ${libraryDir}`);
try {
  await Deno.stat(resolve(libraryDir, "catalog.json"));
} catch {
  console.warn("No catalog.json found in the library directory yet.");
}

console.log(`Listening on http://${hostname}:${port}`);
await app.listen({ port, hostname });
