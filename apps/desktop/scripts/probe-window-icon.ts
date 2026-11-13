// Runs in Electron on Windows. Compare the actual HWND icon with our ICO;
// checking the executable's resources alone does not check the running window.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import koffi from "koffi";
import { createWindow } from "../src/window.ts";

app.setName("Guildie");
app.setAppUserModelId("club.guildie.desktop");
app.setPath("userData", mkdtempSync(join(tmpdir(), "guildie-icon-check-")));
const user = koffi.load("user32.dll");
const gdi = koffi.load("gdi32.dll");
const send = user.func("intptr __stdcall SendMessageW(intptr hwnd, uint32 msg, uintptr wp, intptr lp)");
const getClass = user.func("intptr __stdcall GetClassLongPtrW(intptr hwnd, int index)");
const load = user.func(
	"intptr __stdcall LoadImageW(intptr instance, str16 name, uint32 type, int x, int y, uint32 flags)",
);
const destroy = user.func("bool __stdcall DestroyIcon(intptr icon)");
const dc = gdi.func("intptr __stdcall CreateCompatibleDC(intptr dc)");
const dib = gdi.func(
	"intptr __stdcall CreateDIBSection(intptr dc, void *info, uint32 usage, _Out_ void **bits, intptr section, uint32 offset)",
);
const select = gdi.func("intptr __stdcall SelectObject(intptr dc, intptr object)");
const draw = user.func(
	"bool __stdcall DrawIconEx(intptr dc, int x, int y, intptr icon, int width, int height, uint32 step, intptr brush, uint32 flags)",
);
const deleteObject = gdi.func("bool __stdcall DeleteObject(intptr object)");
const deleteDC = gdi.func("bool __stdcall DeleteDC(intptr dc)");
function pixels(icon: number): Buffer {
	assert(icon, "Windows returned an empty icon handle");
	const header = Buffer.alloc(40);
	header.writeUInt32LE(40, 0);
	header.writeInt32LE(32, 4);
	header.writeInt32LE(-32, 8);
	header.writeUInt16LE(1, 12);
	header.writeUInt16LE(32, 14);
	const context = dc(0);
	const bits = [null];
	const bitmap = dib(context, header, 0, bits, 0, 0);
	assert(bitmap && bits[0], "CreateDIBSection failed");
	const previous = select(context, bitmap);
	try {
		assert(draw(context, 0, 0, icon, 32, 32, 0, 0, 3), "DrawIconEx failed");
		return Buffer.from(koffi.decode(bits[0], "uint8", 32 * 32 * 4));
	} finally {
		select(context, previous);
		deleteObject(bitmap);
		deleteDC(context);
	}
}
await app.whenReady();
const reference = load(0, join(__dirname, "assets", "guildie.ico"), 1, 32, 32, 0x10);
const expected = pixels(reference);
destroy(reference);
let failures = 0;
for (let attempt = 0; attempt < 2; attempt++) {
	const win = createWindow("about:blank", { show: false, preload: join(__dirname, "preload.cjs") });
	const hwnd = Number(win.getNativeWindowHandle().readBigUInt64LE());
	const check = (stage: string) => {
		const icon = Number(send(hwnd, 0x7f, 1, 0)) || Number(getClass(hwnd, -14));
		const matches = pixels(icon).equals(expected);
		console.log(`${matches ? "PASS" : "FAIL"} window ${attempt + 1}, ${stage}: native taskbar icon matches Guildie`);
		if (!matches) failures++;
	};
	check("created");
	await new Promise<void>((resolve) => win.webContents.once("did-finish-load", () => resolve()));
	win.show();
	await new Promise((resolve) => setTimeout(resolve, 300));
	check("shown");
	win.hide();
	win.show();
	check("shown again");
	win.setIcon(join(__dirname, "assets", "guildie.ico"));
	check("explicit setIcon after show");
	win.destroy();
}
app.exit(failures ? 1 : 0);
