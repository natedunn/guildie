"""Find foreground WoW and locate the protocol header in an MSS BGRA image; never retain screenshots."""
import ctypes
from ctypes import wintypes
import math
import os
import re
import sys
import atexit


class RegionShot:
    def __init__(self, shot, left, top):
        self.shot, self.left, self.top = shot, left, top

    def pixel(self, x, y):
        return self.shot.pixel(self.left + x, self.top + y)


def parent_watch(pid):
    """Hold the original process handle so PID reuse cannot keep capture alive."""
    if pid is None:
        return lambda: True
    if sys.platform != "win32":
        # macOS and Linux reparent an orphan (to launchd, init or a subreaper), so
        # once the app is gone the parent never matches again, even if the PID is reused.
        return lambda: os.getppid() == pid
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
    if not handle:
        return lambda: False
    atexit.register(kernel.CloseHandle, handle)
    return lambda: kernel.WaitForSingleObject(handle, 0) == 258  # WAIT_TIMEOUT


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


def is_wow_title(title):
    """Same rule as apps/desktop/src/wow-running.ts isWowTitle: not a browser tab about WoW."""
    return bool(title) and re.match(r"world of warcraft", title, re.IGNORECASE) is not None \
        and re.search(" [-—–] ", title) is None


def capture_scale(window, shot):
    """Image pixels per screen coordinate: 1 on Windows and X11, 2 (or 3) on a Retina Mac."""
    if not window["width"]:
        return 1
    scale = shot.width / window["width"]
    return round(scale) if abs(scale - round(scale)) < 0.01 else scale


def square_region(window, shot, x, y, cell):
    """Screen region to grab for a square found at image pixel (x, y), and the square's
    pixel offset inside that grab. Screen coordinates are points on macOS, so a square
    on an odd pixel needs a slightly larger grab."""
    size = 16 * cell
    scale = capture_scale(window, shot)
    if scale == 1:
        return {"left": window["left"] + x, "top": window["top"] + y, "width": size, "height": size}, 0, 0
    left, top = math.floor(x / scale), math.floor(y / scale)
    right, bottom = math.ceil((x + size) / scale), math.ceil((y + size) / scale)
    region = {"left": window["left"] + left, "top": window["top"] + top,
              "width": right - left, "height": bottom - top}
    return region, x - round(left * scale), y - round(top * scale)


def is_blank(shot):
    """All-black image (alpha ignored): what XWayland can return for a whole window."""
    raw = bytes(shot.bgra)
    return raw.count(0) - raw[3::4].count(0) == 3 * (len(raw) // 4)


def wayland_session(env=None):
    env = os.environ if env is None else env
    return env.get("XDG_SESSION_TYPE", "").lower() == "wayland" or bool(env.get("WAYLAND_DISPLAY"))


def capture_problem(platform=None, env=None, preflight=None):
    """Why capture cannot work at all right now: "permission", "unsupported" or None."""
    platform = sys.platform if platform is None else platform
    env = os.environ if env is None else env
    if platform == "darwin":
        if preflight is None:
            preflight = _screen_capture_allowed
        return None if preflight() else "permission"
    if platform.startswith("linux") and not env.get("DISPLAY"):
        # A Wayland session without XWayland (or no display at all): no X11 to read.
        return "unsupported"
    return None


_asked = False


def _screen_capture_allowed():
    """Screen Recording permission (macOS 10.15+). macOS attributes it to the Guildie app,
    which launched this helper. Asks once per run: macOS shows its dialog only the first
    time for an app, then the player turns Guildie on in System Settings and reopens it."""
    global _asked
    try:
        import Quartz
        if Quartz.CGPreflightScreenCaptureAccess():
            return True
        if not _asked:
            _asked = True
            return bool(Quartz.CGRequestScreenCaptureAccess())
        return False
    except (ImportError, AttributeError):
        return True


def configure_capture(mss_module):
    """macOS: grab Retina pixels, not downscaled points, so cells keep their exact colors."""
    if sys.platform == "darwin":
        import mss.darwin
        mss.darwin.IMAGE_OPTIONS = mss.darwin.kCGWindowImageBoundsIgnoreFraming \
            | mss.darwin.kCGWindowImageShouldBeOpaque


def foreground_wow():
    """Screen rectangle of the WoW window, only while WoW is foreground."""
    if sys.platform == "win32":
        return _foreground_windows()
    if sys.platform == "darwin":
        import Quartz
        windows = Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
            Quartz.kCGNullWindowID)
        return frontmost_mac(windows or [])
    return _foreground_x11()


def _foreground_windows():
    """Client rectangle only. Windows helper."""
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


def _wine_owner(owner):
    owner = owner.lower()
    return owner.endswith(".exe") or any(name in owner for name in ("wine", "crossover", "whisky"))


def frontmost_mac(windows):
    """CGWindowList entries come front to back: the first normal window is the foreground one.
    Window titles of other apps need Screen Recording permission; the owning app's name does
    not, which is enough for the native client. Wine/CrossOver also needs the title."""
    for window in windows:
        bounds = window.get("kCGWindowBounds") or {}
        if window.get("kCGWindowLayer", 0) != 0 or window.get("kCGWindowAlpha", 1) == 0:
            continue
        if bounds.get("Width", 0) < 64 or bounds.get("Height", 0) < 64:
            continue  # invisible helper windows some apps keep in front
        owner = str(window.get("kCGWindowOwnerName") or "")
        title = str(window.get("kCGWindowName") or "")
        if not (is_wow_title(owner) or (_wine_owner(owner) and is_wow_title(title))):
            return None
        return {"left": round(bounds["X"]), "top": round(bounds["Y"]),
                "width": round(bounds["Width"]), "height": round(bounds["Height"])}
    return None


_x11 = None


def _foreground_x11():
    global _x11
    try:
        from Xlib import display as xdisplay, error as xerror
    except ImportError:
        return None
    try:
        if _x11 is None:
            _x11 = xdisplay.Display()
        return foreground_x11(_x11)
    except (xerror.ConnectionClosedError, OSError):
        _x11 = None
        return None
    except (xerror.XError, xerror.DisplayError):
        return None


def foreground_x11(display):
    """The active X11 window (EWMH _NET_ACTIVE_WINDOW) if it is WoW: its client area in root
    coordinates. Wine draws WoW as an X11 window, also under XWayland."""
    root = display.screen().root
    active = root.get_full_property(display.intern_atom("_NET_ACTIVE_WINDOW"), 0)  # AnyPropertyType
    if active is None or not len(active.value) or not active.value[0]:
        return None
    window = display.create_resource_object("window", active.value[0])
    name = window.get_full_text_property(display.intern_atom("_NET_WM_NAME"), display.intern_atom("UTF8_STRING"))
    title = name if isinstance(name, str) else window.get_wm_name()
    if not isinstance(title, str) or not is_wow_title(title):
        return None
    geometry = window.get_geometry()
    origin = root.translate_coords(window, 0, 0)
    if geometry.width <= 0 or geometry.height <= 0:
        return None
    return {"left": origin.x, "top": origin.y, "width": geometry.width, "height": geometry.height}
