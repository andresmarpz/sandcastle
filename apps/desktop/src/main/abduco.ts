import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import { app } from "electron";

// abduco-backed PTY persistence helpers.
//
// We wrap every shell in a detachable abduco session so the shell (and the
// processes inside it) survive a full quit + relaunch and re-attach to their
// original pane. This module is the pure helper layer: it resolves the bundled
// binary, picks a short socket path, and derives a stable session name from the
// durable leafId. No process spawning or IPC lives here.

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

// Sockets in $TMPDIR keep sun_path short (~104-byte limit on macOS) AND get
// cleared on reboot — which matches process lifetime (reboot kills the servers).
export const socketDir = (): string => join(os.tmpdir(), "sandcastle-pty");

// abduco addresses sessions by NAME inside ABDUCO_SOCKET_DIR. Hash leafId to a
// short, filesystem-safe name so the socket path stays well under the limit.
export const sessionName = (leafId: string): string =>
	createHash("sha256").update(leafId).digest("hex").slice(0, 16);

export const socketPath = (leafId: string): string => join(socketDir(), sessionName(leafId));
