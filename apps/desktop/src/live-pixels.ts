// Pilot integration: keep the tested capture process separate from Electron.
// Only a local launch flag can select its executable/config; no renderer IPC.
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

export type PixelConfig = {
	python: string;
	reader: string;
	left: number;
	top: number;
	cell: number;
	theme: "amber" | "gray";
};
export type CaptureConfig = PixelConfig | { executable: string; auto: true };
export type PixelStatus =
	| "waiting"
	| "waiting-game"
	| "searching"
	| "calibrating"
	| "receiving"
	| "stale"
	| "stopped"
	| "failed";

export function parsePixelConfig(value: unknown): PixelConfig {
	if (!value || typeof value !== "object") throw new Error("Invalid pixel config");
	const config = value as Record<string, unknown>;
	for (const key of ["python", "reader"]) {
		if (typeof config[key] !== "string" || !isAbsolute(config[key])) throw new Error(`${key} must be an absolute path`);
	}
	for (const key of ["left", "top", "cell"]) {
		if (!Number.isSafeInteger(config[key])) throw new Error(`${key} must be an integer`);
	}
	if ((config.cell as number) < 2 || (config.cell as number) > 64) throw new Error("cell must be 2–64");
	const theme = config.theme ?? "amber";
	if (theme !== "amber" && theme !== "gray") throw new Error("Invalid pixel theme");
	return { ...config, theme } as PixelConfig;
}

/** Bound buffered output even if a broken reader never sends a newline. */
export class PixelLines {
	private pending = "";
	private readonly record: (channel: "snapshot" | "live" | "status", data: Record<string, unknown>) => void;
	constructor(record: (channel: "snapshot" | "live" | "status", data: Record<string, unknown>) => void) {
		this.record = record;
	}
	feed(chunk: string) {
		this.pending += chunk;
		let end: number;
		while ((end = this.pending.indexOf("\n")) >= 0) {
			if (end > 2 * 1024 * 1024) throw new Error("Pixel record too large");
			const line = this.pending.slice(0, end);
			this.pending = this.pending.slice(end + 1);
			const value = JSON.parse(line);
			if (
				!value ||
				!["snapshot", "live", "status"].includes(value.channel) ||
				!value.data ||
				typeof value.data !== "object" ||
				Array.isArray(value.data)
			)
				throw new Error("Invalid pixel record");
			this.record(value.channel, value.data);
		}
		if (this.pending.length > 2 * 1024 * 1024) throw new Error("Pixel record too large");
	}
}

export class LivePixels {
	private child: ChildProcess | undefined;
	private timer: NodeJS.Timeout | undefined;
	private lastRecord = 0;
	private state: PixelStatus | undefined;
	private readonly config: CaptureConfig;
	private readonly snapshot: (data: unknown) => void;
	private readonly status: (state: PixelStatus) => void;
	constructor(config: CaptureConfig, snapshot: (data: unknown) => void, status: (state: PixelStatus) => void) {
		this.config = config;
		this.snapshot = snapshot;
		this.status = status;
	}
	static configFile(path: string) {
		return parsePixelConfig(JSON.parse(readFileSync(path, "utf8")));
	}
	private setStatus(state: PixelStatus) {
		if (this.state === state) return;
		this.state = state;
		this.status(state);
	}
	start() {
		if (this.child) return;
		const c = this.config;
		this.lastRecord = 0;
		this.setStatus("waiting");
		const child = spawn(
			"auto" in c ? c.executable : c.python,
			"auto" in c
				? ["--auto", "--parent-pid", String(process.pid)]
				: [c.reader, "--left", String(c.left), "--top", String(c.top), "--cell", String(c.cell), "--theme", c.theme],
			{
				windowsHide: true,
				shell: false,
				stdio: ["ignore", "pipe", "ignore"],
				env: { ...process.env, PYTHONIOENCODING: "utf-8" },
			},
		);
		this.child = child;
		const fail = () => {
			if (this.child !== child) return;
			this.stop();
			this.setStatus("failed");
		};
		const lines = new PixelLines((channel, data) => {
			if (channel === "status") {
				if (!["waiting-game", "searching", "calibrating", "receiving"].includes(String(data.state)))
					throw new Error("Invalid capture state");
				this.setStatus(data.state as PixelStatus);
				return;
			}
			this.lastRecord = Date.now();
			this.setStatus("receiving");
			if (channel === "snapshot") this.snapshot(data);
		});
		child.stdout!.setEncoding("utf8");
		child.stdout!.on("data", (chunk: string) => {
			if (this.child !== child) return;
			try {
				lines.feed(chunk);
			} catch {
				fail();
			}
		});
		child.on("error", fail);
		child.on("exit", fail);
		this.timer = setInterval(() => {
			if (this.state === "receiving" && this.lastRecord && Date.now() - this.lastRecord > 10_000)
				this.setStatus("stale");
		}, 2_000);
	}
	stop() {
		clearInterval(this.timer);
		const child = this.child;
		this.child = undefined;
		child?.kill();
		this.setStatus("stopped");
	}
}
