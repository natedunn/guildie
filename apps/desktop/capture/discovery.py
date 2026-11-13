"""Locate the protocol header in an MSS BGRA image; never retain screenshots."""
import ctypes
from ctypes import wintypes
import sys


class RegionShot:
    def __init__(self, shot, left, top):
        self.shot, self.left, self.top = shot, left, top

    def pixel(self, x, y):
        return self.shot.pixel(self.left + x, self.top + y)


def candidates(shot):
    raw = bytes(shot.bgra)
    width, height = shot.width, shot.height
    found = set()
    for cell in range(2, 17):
        for theme in ("amber", "gray"):
            for alpha in (0, 255):
                pattern = b""
                for value in (71, 76, 80, 1):
                    green = int(value * 0.75 + 0.5) if theme == "amber" else value
                    blue = int(value * 0.45 + 0.5) if theme == "amber" else value
                    pattern += bytes((blue, green, value, alpha)) * cell
                offset = raw.find(pattern)
                while offset >= 0:
                    x, y = (offset // 4) % width, (offset // 4) // width
                    if offset % 4 == 0 and x + 16 * cell <= width and y + 16 * cell <= height:
                        # Only the top of a run, not every row within the first cell.
                        if y == 0 or raw[offset - width * 4:offset - width * 4 + len(pattern)] != pattern:
                            key = (x, y, cell, theme)
                            if key not in found:
                                found.add(key)
                                yield key
                                if len(found) >= 64:
                                    return
                    offset = raw.find(pattern, offset + 4)


def foreground_wow():
    """Client rectangle only, and only while WoW is foreground. Windows helper."""
    if sys.platform != "win32":
        raise RuntimeError("Automatic capture currently supports Windows only")
    user = ctypes.windll.user32
    user.GetForegroundWindow.restype = wintypes.HWND
    user.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    user.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
    window = user.GetForegroundWindow()
    title = ctypes.create_unicode_buffer(512)
    user.GetWindowTextW(window, title, len(title))
    if "world of warcraft" not in title.value.lower():
        return None
    rect, origin = wintypes.RECT(), wintypes.POINT(0, 0)
    if not user.GetClientRect(window, ctypes.byref(rect)) or not user.ClientToScreen(window, ctypes.byref(origin)):
        return None
    if rect.right <= 0 or rect.bottom <= 0:
        return None
    return {"left": origin.x, "top": origin.y, "width": rect.right, "height": rect.bottom}
