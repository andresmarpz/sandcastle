import { createHash } from "node:crypto";
import { join } from "node:path";
import process from "node:process";
import { app } from "electron";

// abduco-backed PTY persistence helpers.
//
// We wrap every shell in a detachable abduco session so the shell (and the
// processes inside it) survive a full quit + relaunch and re-attach to their
// original pane. This module is the pure helper layer: it resolves the bundled
// binary, picks the socket dir, and derives a stable session name from the
// durable leafId. No process spawning or IPC lives here.
//
// NOTE: abduco does NOT name its socket "<dir>/<name>". It nests them as
// <ABDUCO_SOCKET_DIR>/<argv0-basename>/<user>/<name>@<host>. So there is no
// simple socketPath() to compute — we never unlink abduco's socket directly.
// Teardown SIGTERMs the abduco server pid instead, and abduco unlinks its own
// socket via its atexit handler (see pty.ts killServer / killSession).

// abduco is unix-only. Windows falls back to a plain shell (no persistence).
export const PERSISTENCE_SUPPORTED = process.platform !== "win32";

// Resolve the bundled binary. resources/** is asarUnpack'd (electron-builder.yml),
// so in prod it lives under process.resourcesPath; in dev, under the repo resources/.
export const abducoBin = (): string => {
	const arch = process.arch; // "arm64" | "x64"
	const name = `abduco-${process.platform}-${arch}`;
	return app.isPackaged
		? join(process.resourcesPath, "bin", name)
		: join(app.getAppPath(), "resources", "bin", name);
};

// abduco builds the socket path as
//   <ABDUCO_SOCKET_DIR>/<argv0-basename>/<user>/<name>@<host>
// (see the nesting note above) and AF_UNIX caps sun_path at ~104 bytes on macOS.
// The first cut of this used os.tmpdir() — but on macOS that's
// /var/folders/<hash>/T (~48 bytes), not the short "/tmp" the name implies. Once
// abduco appended the bundled binary's basename (abduco-darwin-arm64), the user,
// the 16-hex name, and @<hostname>, the path blew past 104 → bind() ENAMETOOLONG,
// surfaced to the user as "create-session: File name too long".
//
// So anchor sockets at a SHORT, fixed root instead. "/tmp" is safe here
// (persistence is gated off on win32, so this is unix-only) and is in fact
// abduco's own default socket root. We don't depend on $TMPDIR's reboot-clearing
// for correctness: abduco unlinks dead sockets on the next connect, and the
// startup reaper kills stale servers.
export const socketDir = (): string => "/tmp/sandcastle";

// abduco addresses sessions by NAME inside ABDUCO_SOCKET_DIR. Hash leafId to a
// short, filesystem-safe name so the socket path stays well under the limit.
export const sessionName = (leafId: string): string =>
	createHash("sha256").update(leafId).digest("hex").slice(0, 16);
