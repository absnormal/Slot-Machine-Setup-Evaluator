"""
螢幕擷取 + 遊戲控制 WebSocket 伺服器
─────────────────────────────────────
用途：
  1. 繞過 Chrome getDisplayMedia 限制，使用 Windows 原生 API 擷取螢幕/視窗畫面
  2. 接收前端的滑鼠/鍵盤控制指令，模擬操作遊戲視窗

擷取引擎：
  - 螢幕模式：mss (DXGI，高效能)
  - 視窗模式：PrintWindow API (支援被遮擋的視窗)

控制引擎：
  - pyautogui：滑鼠點擊、鍵盤輸入、拖曳
  - win32gui：視窗前景化、定位

啟動方式：python server.py
預設埠號：ws://localhost:8765
"""

import asyncio
import json
import base64
import io
import sys
import time
import random

import websockets
import mss
from PIL import Image
import ctypes
import ctypes.wintypes

# ── 控制引擎 ──
try:
    import pyautogui
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.03
    HAS_PYAUTOGUI = True
    print("[模組] pyautogui 已載入 ✓")
except ImportError:
    HAS_PYAUTOGUI = False
    print("[警告] pyautogui 未安裝，控制功能將不可用。執行: pip install pyautogui")

# ── 高效能 JPEG 編碼器 (libjpeg-turbo) ──
try:
    from turbojpeg import TurboJPEG, TJPF_RGB
    import numpy as np
    _turbo = TurboJPEG()
    HAS_TURBOJPEG = True
    print("[模組] turbojpeg 已載入 ✓ (高效能 JPEG 編碼)")
except ImportError:
    HAS_TURBOJPEG = False
    print("[提示] turbojpeg 未安裝，使用 Pillow 編碼 (pip install PyTurboJPEG)")

# ── 後端 OCR (RapidOCR + PaddleOCR ONNX) ──
try:
    import numpy as np  # 確保 numpy 可用
except ImportError:
    pass

_ocr_engine = None  # 延遲初始化
_last_ocr_results = {}  # 追蹤上次 OCR 結果，只在變化時印 log

def get_ocr_engine():
    """延遲初始化 RapidOCR 引擎（第一次呼叫時才載入模型，約 1-2 秒）"""
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            import os
            # 使用與前端相同的 PP-OCRv4 模型
            model_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'ocr-models')
            det_path = os.path.join(model_dir, 'ch_PP-OCRv4_det_infer.onnx')
            rec_path = os.path.join(model_dir, 'ch_PP-OCRv4_rec_infer.onnx')
            keys_path = os.path.join(model_dir, 'ppocr_keys_v1.txt')
            
            kwargs = {}
            if os.path.exists(rec_path):
                kwargs['rec_model_path'] = rec_path
                print(f"[OCR] 使用 PP-OCRv4 rec 模型: {rec_path}")
            if os.path.exists(det_path):
                kwargs['det_model_path'] = det_path
            if os.path.exists(keys_path):
                kwargs['rec_keys_path'] = keys_path
            
            _ocr_engine = RapidOCR(**kwargs)
            print("[模組] RapidOCR 已載入 ✓ (後端 PaddleOCR v4)")
        except Exception as e:
            print(f"[警告] RapidOCR 載入失敗: {e}")
            return None
    return _ocr_engine

import re

def ocr_crop_and_clean(pil_img, roi, decimal_places=2, label="", mode="number"):
    """
    從 PIL Image 裁切 ROI 區域並執行 OCR。
    roi: {x, y, w, h} -- 百分比 (0-100)
    mode: 'number'（只取數字）或 'text'（回傳原始辨識文字）
    """
    engine = get_ocr_engine()
    if engine is None:
        return ""
    
    img_w, img_h = pil_img.size
    cx = int(img_w * roi["x"] / 100)
    cy = int(img_h * roi["y"] / 100)
    cw = int(img_w * roi["w"] / 100)
    ch = int(img_h * roi["h"] / 100)
    if cw < 2 or ch < 2:
        return ""
    
    crop = pil_img.crop((cx, cy, cx + cw, cy + ch))
    
    # 放大至約 48px 高度（與前端 ocrPipeline 對齊）
    scale = max(1.0, 48.0 / ch)
    # 水平拉寬 1.25 倍（與前端對齊）：解決 CTC 把連續相同數字合併的問題
    stretch_x = 1.25
    new_w = int(cw * scale * stretch_x)
    new_h = int(ch * scale)
    crop = crop.resize((new_w, new_h), Image.LANCZOS)
    
    # 對比度 + 亮度增強（與前端 ctx.filter = 'contrast(1.2) brightness(1.1)' 對齊）
    from PIL import ImageEnhance
    crop = ImageEnhance.Contrast(crop).enhance(1.2)
    crop = ImageEnhance.Brightness(crop).enhance(1.1)
    
    # rec-only 不需要大 padding，最小 padding 即可
    PADDING = 10
    padded = Image.new('RGB', (new_w + PADDING * 2, new_h + PADDING * 2), (0, 0, 0))
    padded.paste(crop, (PADDING, PADDING))
    
    # 轉 numpy array 給 RapidOCR
    import numpy as np
    img_array = np.array(padded)
    
    # rec-only 模式：跳過 DBNet 偵測，直接辨識（~70ms vs 完整管線 ~330ms）
    # stretch_x=1.25 已修正，小數點不再丟失
    result, _ = engine(img_array, use_det=False, use_cls=False, use_rec=True)
    if not result:
        return ""
    
    # rec-only 模式回傳 [[text, score], ...]，完整模式回傳 [[box, text, score], ...]
    texts = []
    for line in result:
        if isinstance(line[0], str):
            texts.append(line[0])       # rec-only: [text, score]
        else:
            texts.append(str(line[1]))   # full: [box, text, score]
    raw_text = " ".join(texts).strip()
    
    # 後處理（與前端 ocrPipeline.js 對齊）
    # ── 文字模式：直接回傳原始辨識結果 ──
    if mode == "text":
        return raw_text

    # ── 數字模式（預設） ──
    if label == "ORDER_ID":
        return re.sub(r'[^0-9\-]', '', raw_text)
    
    # 數字模式：只保留數字、小數點、逗號
    valid = re.sub(r'[^0-9.,]', '', raw_text)
    cleaned = valid.replace(',', '').strip('.')
    if not cleaned:
        return "0"
    
    if decimal_places == 0:
        return cleaned.replace('.', '') or "0"
    
    # 多小數點修正（千分位誤判）
    parts = cleaned.split('.')
    if len(parts) > 2:
        decimals = parts.pop()
        cleaned = ''.join(parts) + '.' + decimals
    
    # 截斷小數位數
    if isinstance(decimal_places, int) and decimal_places > 0 and '.' in cleaned:
        int_part, dec_part = cleaned.split('.', 1)
        cleaned = int_part + '.' + dec_part[:decimal_places].ljust(decimal_places, '0')
    
    return cleaned

try:
    ctypes.windll.user32.SetProcessDPIAware()
except AttributeError:
    pass

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

# ── GDI 結構定義（用於 PrintWindow + GetDIBits）──
class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize', ctypes.wintypes.DWORD),
        ('biWidth', ctypes.c_long),
        ('biHeight', ctypes.c_long),
        ('biPlanes', ctypes.wintypes.WORD),
        ('biBitCount', ctypes.wintypes.WORD),
        ('biCompression', ctypes.wintypes.DWORD),
        ('biSizeImage', ctypes.wintypes.DWORD),
        ('biXPelsPerMeter', ctypes.c_long),
        ('biYPelsPerMeter', ctypes.c_long),
        ('biClrUsed', ctypes.wintypes.DWORD),
        ('biClrImportant', ctypes.wintypes.DWORD),
    ]

class BITMAPINFO(ctypes.Structure):
    _fields_ = [
        ('bmiHeader', BITMAPINFOHEADER),
    ]

PW_RENDERFULLCONTENT = 2  # 讓 WPF/UWP/硬體加速視窗也能正確渲染


def capture_window_printwindow(hwnd):
    """
    使用 PrintWindow API 截取視窗畫面。
    即使視窗被其他程式遮擋、或部分移出螢幕外，仍可正確截取。
    回傳 PIL.Image (RGB) 或 None（視窗無效/最小化時）。
    """
    # 1. 取得視窗尺寸
    rect = ctypes.wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    w = rect.right - rect.left
    h = rect.bottom - rect.top
    if w <= 0 or h <= 0:
        return None

    # 2. 建立 GDI 物件
    hwnd_dc = user32.GetWindowDC(hwnd)
    mem_dc = gdi32.CreateCompatibleDC(hwnd_dc)
    bitmap = gdi32.CreateCompatibleBitmap(hwnd_dc, w, h)
    old_obj = gdi32.SelectObject(mem_dc, bitmap)

    # 3. PrintWindow — 向目標視窗請求自行繪製到我們的 DC
    result = user32.PrintWindow(hwnd, mem_dc, PW_RENDERFULLCONTENT)

    # 4. GetDIBits — 從 bitmap 取出原始像素資料
    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = w
    bmi.bmiHeader.biHeight = -h  # 負值 = top-down (不用翻轉)
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = 0  # BI_RGB

    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(mem_dc, bitmap, 0, h, buf, ctypes.byref(bmi), 0)

    # 5. 轉為 PIL Image
    img = Image.frombuffer('RGBA', (w, h), buf, 'raw', 'BGRA', 0, 1)

    # 6. 清理 GDI 資源（必須！否則記憶體洩漏）
    gdi32.SelectObject(mem_dc, old_obj)
    gdi32.DeleteObject(bitmap)
    gdi32.DeleteDC(mem_dc)
    user32.ReleaseDC(hwnd, hwnd_dc)

    if result != 1:
        return None

    return img.convert('RGB')

def get_windows():
    windows = []
    def enum_cb(hwnd, lparam):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                title_buffer = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, title_buffer, length + 1)
                title = title_buffer.value
                
                rect = ctypes.wintypes.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                w = rect.right - rect.left
                h = rect.bottom - rect.top
                
                # 過濾過小或無效的視窗
                if w > 100 and h > 100:
                    windows.append({
                        "id": f"window_{hwnd}",
                        "type": "window",
                        "hwnd": hwnd,
                        "label": f"[視窗] {title[:30]}",
                        "rect": {"left": rect.left, "top": rect.top, "width": w, "height": h}
                    })
        return True
    
    user32.EnumWindows(WNDENUMPROC(enum_cb), 0)
    return windows


# ═══════════════════════════════════════════════
#  控制指令處理器
# ═══════════════════════════════════════════════

# Win32 訊息常數
WM_LBUTTONDOWN = 0x0201
WM_LBUTTONUP   = 0x0202
WM_RBUTTONDOWN = 0x0204
WM_RBUTTONUP   = 0x0205
MK_LBUTTON     = 0x0001

def MAKELPARAM(x, y):
    """將 (x, y) 打包成 LPARAM (低 16 bit = x, 高 16 bit = y)"""
    return (int(y) << 16) | (int(x) & 0xFFFF)


def get_window_rect(hwnd):
    """取得視窗在螢幕上的絕對座標"""
    rect = ctypes.wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return {
        "left": rect.left,
        "top": rect.top,
        "width": rect.right - rect.left,
        "height": rect.bottom - rect.top
    }

def roi_to_screen(roi_pct, window_rect):
    """
    ROI % -> screen absolute coords (center point).
    roi_pct: { x, y, w, h } -- percentage (0-100)
    window_rect: { left, top, width, height } -- pixel coords
    Returns: (screen_x, screen_y)
    """
    cx_pct = roi_pct["x"] + roi_pct["w"] / 2.0
    cy_pct = roi_pct["y"] + roi_pct["h"] / 2.0
    screen_x = window_rect["left"] + int(cx_pct / 100.0 * window_rect["width"])
    screen_y = window_rect["top"] + int(cy_pct / 100.0 * window_rect["height"])
    return screen_x, screen_y

def roi_to_client(roi_pct, hwnd):
    """
    ROI % -> window client-area coords (center point).
    Uses ScreenToClient to correctly handle title bar / borders.
    Returns: (client_x, client_y) or None
    """
    window_rect = get_window_rect(hwnd)
    screen_x, screen_y = roi_to_screen(roi_pct, window_rect)
    # Convert screen coords -> client-area coords
    pt = ctypes.wintypes.POINT(screen_x, screen_y)
    user32.ScreenToClient(hwnd, ctypes.byref(pt))
    return pt.x, pt.y


def click_background(hwnd, client_x, client_y, button="left"):
    """
    Background click via PostMessage.
    Sends WM_LBUTTONDOWN + WM_LBUTTONUP directly to the target window
    WITHOUT moving the physical mouse cursor. The user can continue
    using their mouse for other tasks.
    """
    lparam = MAKELPARAM(client_x, client_y)
    if button == "right":
        user32.PostMessageW(hwnd, WM_RBUTTONDOWN, MK_LBUTTON, lparam)
        time.sleep(0.04)
        user32.PostMessageW(hwnd, WM_RBUTTONUP, 0, lparam)
    else:
        user32.PostMessageW(hwnd, WM_LBUTTONDOWN, MK_LBUTTON, lparam)
        time.sleep(0.04)
        user32.PostMessageW(hwnd, WM_LBUTTONUP, 0, lparam)


# ═══════════════════════════════════════════════
#  背景鍵盤操作
#  策略：
#    1. PostMessage — 對原生 Win32 視窗有效，完全不搶焦點
#    2. focus+SendInput fallback — 對瀏覽器等現代視窗，
#       短暫搶焦點 (~50ms) 然後還原，實務上使用者幾乎無感
# ═══════════════════════════════════════════════

WM_KEYDOWN = 0x0100
WM_KEYUP   = 0x0101
WM_CHAR    = 0x0102

# pyautogui 鍵名 → Windows Virtual Key Code
VK_MAP = {
    'backspace': 0x08, 'tab': 0x09, 'clear': 0x0C,
    'enter': 0x0D, 'return': 0x0D,
    'shift': 0x10, 'shiftleft': 0x10, 'shiftright': 0xA1,
    'ctrl': 0x11, 'control': 0x11, 'ctrlleft': 0x11, 'ctrlright': 0xA3,
    'alt': 0x12, 'altleft': 0x12, 'altright': 0xA5,
    'pause': 0x13, 'capslock': 0x14,
    'escape': 0x1B, 'esc': 0x1B,
    'space': 0x20,
    'pageup': 0x21, 'pgup': 0x21,
    'pagedown': 0x22, 'pgdn': 0x22,
    'end': 0x23, 'home': 0x24,
    'left': 0x25, 'up': 0x26, 'right': 0x27, 'down': 0x28,
    'printscreen': 0x2C, 'prtsc': 0x2C,
    'insert': 0x2D, 'delete': 0x2E, 'del': 0x2E,
    'win': 0x5B, 'winleft': 0x5B, 'winright': 0x5C,
    'num0': 0x60, 'num1': 0x61, 'num2': 0x62, 'num3': 0x63,
    'num4': 0x64, 'num5': 0x65, 'num6': 0x66, 'num7': 0x67,
    'num8': 0x68, 'num9': 0x69,
    'multiply': 0x6A, 'add': 0x6B, 'subtract': 0x6D,
    'decimal': 0x6E, 'divide': 0x6F,
    'f1': 0x70, 'f2': 0x71, 'f3': 0x72, 'f4': 0x73,
    'f5': 0x74, 'f6': 0x75, 'f7': 0x76, 'f8': 0x77,
    'f9': 0x78, 'f10': 0x79, 'f11': 0x7A, 'f12': 0x7B,
    'numlock': 0x90, 'scrolllock': 0x91,
    ';': 0xBA, '=': 0xBB, ',': 0xBC, '-': 0xBD,
    '.': 0xBE, '/': 0xBF, '`': 0xC0,
    '[': 0xDB, '\\': 0xDC, ']': 0xDD, "'": 0xDE,
}

# 需要 Extended key flag 的虛擬鍵
EXTENDED_KEYS = {
    0x21, 0x22, 0x23, 0x24,  # PageUp/Down, End, Home
    0x25, 0x26, 0x27, 0x28,  # Arrow keys
    0x2D, 0x2E,              # Insert, Delete
    0x5B, 0x5C,              # Win keys
    0xA3, 0xA5,              # Right Ctrl, Right Alt
}

# 修飾鍵 VK 碼集合
MODIFIER_VKS = {0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5}

# 不接受 PostMessage 鍵盤的視窗類別（瀏覽器等）
BROWSER_CLASSES = {'Chrome_WidgetWin_1', 'MozillaWindowClass', 'Chrome_WidgetWin_0'}


def get_vk_code(key_name):
    """將按鍵名稱轉為 Windows Virtual Key Code"""
    key = key_name.lower().strip()
    if key in VK_MAP:
        return VK_MAP[key]
    # 單字母 A-Z / 單數字 0-9
    if len(key) == 1:
        ch = key.upper()
        if 'A' <= ch <= 'Z' or '0' <= ch <= '9':
            return ord(ch)
    return None


def _make_key_lparam(vk, is_up=False):
    """組裝 WM_KEYDOWN / WM_KEYUP 的 lParam"""
    scan_code = user32.MapVirtualKeyW(vk, 0) & 0xFF
    lparam = 1  # repeat count
    lparam |= scan_code << 16
    if vk in EXTENDED_KEYS:
        lparam |= (1 << 24)
    if is_up:
        lparam |= (1 << 30) | (1 << 31)
    return ctypes.c_long(lparam).value  # 確保 32-bit 正確傳遞


def _is_browser_window(hwnd):
    """偵測目標視窗是否為瀏覽器（PostMessage 鍵盤無效）"""
    try:
        buf = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, buf, 256)
        return buf.value in BROWSER_CLASSES
    except:
        return False


# ── SendInput 低階鍵盤（用於瀏覽器等不接受 PostMessage 的視窗）──

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_SCANCODE = 0x0008


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", ctypes.c_ushort),
        ("wScan", ctypes.c_ushort),
        ("dwFlags", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    ]


class INPUT(ctypes.Structure):
    class _INPUT(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("_pad", ctypes.c_byte * 64)]
    _anonymous_ = ("_input",)
    _fields_ = [("type", ctypes.c_ulong), ("_input", _INPUT)]


def _send_input_key(vk, is_up=False):
    """發送一個 SendInput 鍵盤事件"""
    flags = 0
    if is_up:
        flags |= KEYEVENTF_KEYUP
    if vk in EXTENDED_KEYS:
        flags |= KEYEVENTF_EXTENDEDKEY

    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.ki = KEYBDINPUT(
        wVk=vk,
        wScan=user32.MapVirtualKeyW(vk, 0) & 0xFF,
        dwFlags=flags,
        time=0,
        dwExtraInfo=None,
    )
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))


def _force_foreground(hwnd):
    """
    強制將指定視窗帶到前景（不改變視窗大小/狀態）。
    Windows 10/11 限制非前景程序呼叫 SetForegroundWindow，
    使用 AttachThreadInput 繞過此限制。
    回傳：焦點轉移是否成功 (bool)
    """
    if user32.GetForegroundWindow() == hwnd:
        return True  # 已是前景，不需操作

    foreground_hwnd = user32.GetForegroundWindow()
    fg_tid = user32.GetWindowThreadProcessId(foreground_hwnd, None)
    our_tid = ctypes.windll.kernel32.GetCurrentThreadId()

    # 附接到目前前景視窗的執行緒，讓我們取得 SetForegroundWindow 權限
    if fg_tid and fg_tid != our_tid:
        user32.AttachThreadInput(our_tid, fg_tid, True)

    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)

    if fg_tid and fg_tid != our_tid:
        user32.AttachThreadInput(our_tid, fg_tid, False)

    # 等待焦點確實轉移（最多 300ms，每 30ms 查一次）
    for _ in range(10):
        if user32.GetForegroundWindow() == hwnd:
            return True
        time.sleep(0.03)

    print(f"[警告] 焦點轉移未成功：當前前景={user32.GetForegroundWindow()} 目標={hwnd}")
    return False


def _focus_send_restore(hwnd, send_fn):
    """
    短暫搶焦點 → 執行鍵盤操作 → 還原原視窗。
    對瀏覽器視窗，使用 AttachThreadInput 可靠搶焦點。
    """
    prev_hwnd = user32.GetForegroundWindow()
    ok = _force_foreground(hwnd)
    if ok:
        time.sleep(0.05)  # 讓瀏覽器有時間處理焦點事件（重要！）
        send_fn()
        time.sleep(0.03)
    else:
        # 焦點轉移失敗 → 仍嘗試發送（有時 GetForegroundWindow 的判斷不完全準確）
        time.sleep(0.08)
        send_fn()

    # 還原原本的前景視窗
    if prev_hwnd and prev_hwnd != hwnd:
        _force_foreground(prev_hwnd)


def bg_key_press(hwnd, key_name):
    """背景單鍵按壓"""
    vk = get_vk_code(key_name)
    if vk is None:
        return False

    if _is_browser_window(hwnd):
        # 瀏覽器：搶焦點後用 pyautogui（最可靠）
        def send():
            if HAS_PYAUTOGUI:
                pyautogui.press(key_name)
                print(f"[鍵盤] pyautogui.press('{key_name}') done")
            else:
                _send_input_key(vk, False)
                time.sleep(0.03)
                _send_input_key(vk, True)
        _focus_send_restore(hwnd, send)
    else:
        # 原生視窗：PostMessage（完全背景）
        user32.PostMessageW(hwnd, WM_KEYDOWN, vk, _make_key_lparam(vk, False))
        time.sleep(0.03)
        user32.PostMessageW(hwnd, WM_KEYUP, vk, _make_key_lparam(vk, True))
    return True


def bg_hotkey(hwnd, key_names):
    """背景組合鍵"""
    # 先驗證所有鍵名是否可解析（僅非瀏覽器模式需要）
    vks = []
    for k in key_names:
        vk = get_vk_code(k)
        vks.append(vk)  # 瀏覽器模式下 vk=None 也允許，pyautogui 用鍵名

    if _is_browser_window(hwnd):
        # 瀏覽器：搶焦點後用 pyautogui.hotkey（最可靠）
        def send():
            if HAS_PYAUTOGUI:
                pyautogui.hotkey(*key_names)
                print(f"[鍵盤] pyautogui.hotkey({key_names}) done")
            else:
                modifiers = [vk for vk in vks if vk and vk in MODIFIER_VKS]
                main_keys = [vk for vk in vks if vk and vk not in MODIFIER_VKS]
                for vk in modifiers:
                    _send_input_key(vk, False); time.sleep(0.02)
                for vk in main_keys:
                    _send_input_key(vk, False); time.sleep(0.02)
                    _send_input_key(vk, True); time.sleep(0.02)
                for vk in reversed(modifiers):
                    _send_input_key(vk, True); time.sleep(0.02)
        _focus_send_restore(hwnd, send)
    else:
        # 非瀏覽器視窗：驗證 VK code，PostMessage（完全背景）
        if any(vk is None for vk in vks):
            return False
        modifiers = [vk for vk in vks if vk in MODIFIER_VKS]
        main_keys = [vk for vk in vks if vk not in MODIFIER_VKS]
        for vk in modifiers:
            user32.PostMessageW(hwnd, WM_KEYDOWN, vk, _make_key_lparam(vk, False))
            time.sleep(0.02)
        for vk in main_keys:
            user32.PostMessageW(hwnd, WM_KEYDOWN, vk, _make_key_lparam(vk, False))
            time.sleep(0.02)
            user32.PostMessageW(hwnd, WM_KEYUP, vk, _make_key_lparam(vk, True))
            time.sleep(0.02)
        for vk in reversed(modifiers):
            user32.PostMessageW(hwnd, WM_KEYUP, vk, _make_key_lparam(vk, True))
            time.sleep(0.02)

    return True


def handle_control_command(cmd, active_source=None):
    """
    Process control commands from frontend.

    For window mode, uses PostMessage for both click and keyboard,
    so the user's physical mouse AND keyboard are never touched.
    Falls back to pyautogui only for monitor/screen mode.

    Supported actions:
      click, click_pct, click_roi, key, hotkey, type_text, move, drag, focus
    """
    action = cmd.get("action")

    # Get window info (if window mode)
    window_rect = None
    hwnd = None
    if active_source and active_source.get("type") == "window":
        hwnd = active_source.get("hwnd")
        if hwnd:
            window_rect = get_window_rect(hwnd)

    try:
        # Optional human-like random delay
        humanize = cmd.get("humanize", False)
        if humanize:
            time.sleep(random.uniform(0.05, 0.15))

        if action == "click":
            x, y = int(cmd["x"]), int(cmd["y"])
            button = cmd.get("button", "left")
            if hwnd:
                # Window mode -> background click (convert screen -> client)
                pt = ctypes.wintypes.POINT(x, y)
                user32.ScreenToClient(hwnd, ctypes.byref(pt))
                click_background(hwnd, pt.x, pt.y, button)
                return {"success": True, "message": f"bg_click ({x},{y}) -> client ({pt.x},{pt.y})"}
            elif HAS_PYAUTOGUI:
                pyautogui.click(x, y, button=button)
                return {"success": True, "message": f"click ({x}, {y}) button={button}"}
            else:
                return {"success": False, "message": "No hwnd and pyautogui not installed"}

        elif action == "click_pct":
            if not window_rect:
                return {"success": False, "message": "click_pct requires window mode"}
            x_pct, y_pct = float(cmd["xPct"]), float(cmd["yPct"])
            screen_x = window_rect["left"] + int(x_pct / 100.0 * window_rect["width"])
            screen_y = window_rect["top"] + int(y_pct / 100.0 * window_rect["height"])
            button = cmd.get("button", "left")
            if hwnd:
                pt = ctypes.wintypes.POINT(screen_x, screen_y)
                user32.ScreenToClient(hwnd, ctypes.byref(pt))
                click_background(hwnd, pt.x, pt.y, button)
                return {"success": True, "message": f"bg_click_pct ({x_pct:.1f}%,{y_pct:.1f}%) -> client ({pt.x},{pt.y})"}
            elif HAS_PYAUTOGUI:
                pyautogui.click(screen_x, screen_y, button=button)
                return {"success": True, "message": f"click_pct ({x_pct:.1f}%,{y_pct:.1f}%) -> ({screen_x},{screen_y})"}

        elif action == "click_roi":
            if not window_rect:
                return {"success": False, "message": "click_roi requires window mode"}
            roi = cmd["roi"]
            button = cmd.get("button", "left")
            if hwnd:
                # Background click: ROI % -> client coords directly
                client_x, client_y = roi_to_client(roi, hwnd)
                click_background(hwnd, client_x, client_y, button)
                return {"success": True, "message": f"bg_click_roi -> client ({client_x},{client_y})"}
            elif HAS_PYAUTOGUI:
                screen_x, screen_y = roi_to_screen(roi, window_rect)
                pyautogui.click(screen_x, screen_y, button=button)
                return {"success": True, "message": f"click_roi -> ({screen_x},{screen_y})"}

        elif action == "key":
            key = cmd["key"]
            print(f"[鍵盤] key='{key}' hwnd={hwnd} is_browser={_is_browser_window(hwnd) if hwnd else 'N/A'}")
            if hwnd:
                ok = bg_key_press(hwnd, key)
                if ok:
                    return {"success": True, "message": f"bg_key '{key}'"}
                return {"success": False, "message": f"Unknown key: '{key}'"}
            elif HAS_PYAUTOGUI:
                pyautogui.press(key)
                return {"success": True, "message": f"key '{key}'"}
            else:
                return {"success": False, "message": "No hwnd and pyautogui not installed"}

        elif action == "type_text":
            text = str(cmd.get("text", ""))
            print(f"[鍵盤] type_text='{text[:30]}' hwnd={hwnd} is_browser={_is_browser_window(hwnd) if hwnd else 'N/A'}")
            try:
                import pyperclip
                pyperclip.copy(text)
            except Exception as clip_err:
                return {"success": False, "message": f"pyperclip 錯誤: {clip_err}"}
            if hwnd:
                # 背景輸入：剪貼簿 + Ctrl+V
                time.sleep(0.05)
                ok = bg_hotkey(hwnd, ['ctrl', 'v'])
                return {"success": True if ok else False,
                        "message": f"bg_typed '{text}'" if ok else "bg_hotkey ctrl+v 失敗"}
            elif HAS_PYAUTOGUI:
                pyautogui.hotkey('ctrl', 'v')
                return {"success": True, "message": f"typed '{text}'"}
            else:
                return {"success": False, "message": "No hwnd and pyautogui not installed"}

        elif action == "hotkey":
            keys = cmd["keys"]
            print(f"[鍵盤] hotkey='{'+'.join(keys)}' hwnd={hwnd} is_browser={_is_browser_window(hwnd) if hwnd else 'N/A'}")
            if hwnd:
                ok = bg_hotkey(hwnd, keys)
                if ok:
                    return {"success": True, "message": f"bg_hotkey {'+'.join(keys)}"}
                unknown = [k for k in keys if get_vk_code(k) is None]
                return {"success": False, "message": f"Unknown keys: {unknown}"}
            elif HAS_PYAUTOGUI:
                pyautogui.hotkey(*keys)
                return {"success": True, "message": f"hotkey {'+'.join(keys)}"}
            else:
                return {"success": False, "message": "No hwnd and pyautogui not installed"}

        elif action == "move":
            if not HAS_PYAUTOGUI:
                return {"success": False, "message": "pyautogui not installed"}
            x, y = int(cmd["x"]), int(cmd["y"])
            pyautogui.moveTo(x, y, duration=0.1)
            return {"success": True, "message": f"move ({x}, {y})"}

        elif action == "drag":
            if not HAS_PYAUTOGUI:
                return {"success": False, "message": "pyautogui not installed"}
            fx, fy = int(cmd["fromX"]), int(cmd["fromY"])
            tx, ty = int(cmd["toX"]), int(cmd["toY"])
            pyautogui.moveTo(fx, fy, duration=0.1)
            pyautogui.drag(tx - fx, ty - fy, duration=0.3)
            return {"success": True, "message": f"drag ({fx},{fy}) -> ({tx},{ty})"}

        elif action == "focus":
            if hwnd:
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SetForegroundWindow(hwnd)
                return {"success": True, "message": f"focus window hwnd={hwnd}"}
            else:
                return {"success": False, "message": "No target hwnd"}

        elif action == "ocr_rois":
            # ── 後端批次 OCR：截取當前畫面，裁切多個 ROI，一次回傳全部結果 ──
            if not window_rect and not active_source:
                return {"success": False, "message": "ocr_rois requires active source"}
            
            rois = cmd.get("rois", [])  # [{name, roi: {x,y,w,h}, decimalPlaces, label}]
            if not rois:
                return {"success": False, "message": "No ROIs specified"}
            
            # 優先使用前端提供的截圖（capture_frame 產生的）
            provided_image = cmd.get("image")
            pil_img = None
            
            if provided_image:
                try:
                    # 解析 data:image/jpeg;base64,... 格式
                    img_data = provided_image
                    if ',' in img_data:
                        img_data = img_data.split(',', 1)[1]
                    pil_img = Image.open(io.BytesIO(base64.b64decode(img_data))).convert('RGB')
                except Exception as e:
                    print(f"[OCR] 前端截圖解析失敗，改用本地截取: {e}")
                    pil_img = None
            
            # 沒有前端截圖 → 自行截取當前畫面
            if pil_img is None:
                if not window_rect and not active_source:
                    return {"success": False, "message": "ocr_rois requires active source or image"}
                
                hwnd_ocr = active_source.get("hwnd") if active_source else None
                
                if hwnd_ocr:
                    pil_img = capture_window_printwindow(hwnd_ocr)
                
                if pil_img is None:
                    try:
                        with mss.MSS() as sct:
                            if active_source and active_source.get("type") == "window" and hwnd_ocr:
                                r = ctypes.wintypes.RECT()
                                user32.GetWindowRect(hwnd_ocr, ctypes.byref(r))
                                bbox = (r.left, r.top, r.right, r.bottom)
                                raw_grab = sct.grab(bbox)
                                pil_img = Image.frombytes("RGB", raw_grab.size, raw_grab.bgra, "raw", "BGRX")
                            else:
                                monitor = sct.monitors[active_source.get("index", 1)]
                                raw_grab = sct.grab(monitor)
                                pil_img = Image.frombytes("RGB", raw_grab.size, raw_grab.bgra, "raw", "BGRX")
                    except Exception as e:
                        return {"success": False, "message": f"Screenshot failed: {e}"}
            
            if pil_img is None:
                return {"success": False, "message": "Could not capture screen"}
            
            # 批次 OCR
            t0 = time.time()
            results = {}
            for roi_def in rois:
                name = roi_def.get("name", "unknown")
                roi = roi_def.get("roi")
                dp = roi_def.get("decimalPlaces", 2)
                lbl = roi_def.get("label", name)
                if roi:
                    try:
                        ocr_mode = roi_def.get("mode", "number")
                        val = ocr_crop_and_clean(pil_img, roi, dp, lbl, ocr_mode)
                        results[name] = val
                    except Exception as e:
                        results[name] = ""
                        print(f"[OCR 錯誤] {name}: {e}")
            
            elapsed_ms = (time.time() - t0) * 1000
            global _last_ocr_results
            if results != _last_ocr_results:
                if _last_ocr_results:
                    print(f"[OCR] ⚡ {_last_ocr_results} → {results} ({elapsed_ms:.0f}ms)")
                else:
                    print(f"[OCR] 基準值: {results} ({elapsed_ms:.0f}ms)")
                _last_ocr_results = dict(results)
            else:
                print(f"[OCR] {results} ({elapsed_ms:.0f}ms)")
            return {"success": True, "message": f"ocr_rois done in {elapsed_ms:.0f}ms", "ocrResults": results}

        elif action == "log":
            msg = cmd.get("message", "")
            print(f"[流程] {msg}")
            return {"success": True, "message": "logged"}

        else:
            return {"success": False, "message": f"Unknown action: {action}"}

    except Exception as e:
        return {"success": False, "message": f"Control error: {str(e)}"}


# ═══════════════════════════════════════════════
#  WebSocket 連線處理
# ═══════════════════════════════════════════════

# 共享的活動來源資訊（讓控制連線也能知道目標視窗）
active_sources = {}  # ws_id → source dict


async def handle_client(websocket):
    """處理單一 WebSocket 連線"""
    print(f"[連線] 前端已連線: {websocket.remote_address}")

    try:
        # ── 1. 等待前端的設定指令 ──
        raw = await websocket.recv()
        config = json.loads(raw)
        action = config.get("action", "start")

        if action == "list_monitors" or action == "list_sources":
            # 回傳可用螢幕與視窗列表
            sources = []
            with mss.MSS() as sct:
                for i, m in enumerate(sct.monitors):
                    sources.append({
                        "id": f"monitor_{i}",
                        "type": "monitor",
                        "index": i,
                        "label": "所有螢幕 (合併)" if i == 0 else f"螢幕 {i} ({m['width']}x{m['height']})",
                        "left": m["left"],
                        "top": m["top"],
                        "width": m["width"],
                        "height": m["height"]
                    })
            
            try:
                sources.extend(get_windows())
            except Exception as e:
                print("無法獲取視窗列表:", e)

            # 加入控制能力資訊
            await websocket.send(json.dumps({
                "type": "monitors",
                "data": sources,
                "capabilities": {
                    "control": HAS_PYAUTOGUI,
                    "actions": ["click", "click_pct", "click_roi", "key", "type_text", "hotkey", "move", "drag", "focus"]
                        if HAS_PYAUTOGUI else []
                }
            }))
            print(f"[資訊] 回傳 {len(sources)} 個來源資訊 (控制能力: {HAS_PYAUTOGUI})")

            # 等待前端選擇螢幕後的 start 指令
            raw = await websocket.recv()
            config = json.loads(raw)

        # ── 判斷連線模式 ──
        action = config.get("action", "start")

        if action == "control_only":
            # 純控制模式：不串流畫面，只處理控制指令
            await handle_control_session(websocket, config)
            return

        # ── 2. 開始串流 ──
        source = config.get("source", {"type": "monitor", "index": 1})
        fps = config.get("fps", 15)
        quality = config.get("quality", 60)
        # 可選：僅擷取指定區域 (相對於來源的裁切)
        crop = config.get("crop", None)

        # 記錄活動來源
        ws_id = id(websocket)
        active_sources[ws_id] = source

        interval = 1.0 / fps
        frame_count = 0
        start_time = time.time()

        print(f"[串流] 開始擷取 來源={source.get('label', source)}, FPS={fps}, 品質={quality}")

        with mss.MSS() as sct:
            while True:
                loop_start = time.time()

                pil_img = None

                # ── 擷取來源 ──
                if source["type"] == "monitor":
                    # 螢幕模式：使用 mss (DXGI，最高效能)
                    monitor = sct.monitors[source["index"]]
                    raw = sct.grab(monitor)
                    pil_img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")

                elif source["type"] == "window":
                    # 視窗模式：使用 mss (高效能，需視窗不被遮擋)
                    # 如需被遮擋也能截取，改用: pil_img = capture_window_printwindow(source["hwnd"])
                    hwnd = source["hwnd"]
                    rect = ctypes.wintypes.RECT()
                    user32.GetWindowRect(hwnd, ctypes.byref(rect))
                    ww = rect.right - rect.left
                    hh = rect.bottom - rect.top
                    if ww > 0 and hh > 0:
                        bbox = (rect.left, rect.top, rect.right, rect.bottom)
                        try:
                            raw = sct.grab(bbox)
                            pil_img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
                        except mss.exception.ScreenShotError:
                            pass

                if pil_img is None:
                    # 無法擷取 (視窗被最小化或已關閉)
                    await asyncio.sleep(interval)
                    continue

                # 如果有裁切設定
                if crop:
                    pil_img = pil_img.crop((
                        crop["x"], crop["y"],
                        crop["x"] + crop["w"],
                        crop["y"] + crop["h"]
                    ))

                # 效能優化：限制最大寬度為 1920，過大則縮放，大幅減少傳輸與編碼時間
                max_width = 1920
                if pil_img.width > max_width:
                    ratio = max_width / float(pil_img.width)
                    new_h = int(float(pil_img.height) * float(ratio))
                    pil_img = pil_img.resize((max_width, new_h), Image.Resampling.NEAREST)

                # 壓縮為 JPEG (優先使用 turbojpeg)
                if HAS_TURBOJPEG:
                    arr = np.array(pil_img)
                    jpeg_buf = _turbo.encode(arr, quality=quality, pixel_format=TJPF_RGB)
                else:
                    buf = io.BytesIO()
                    pil_img.save(buf, format="JPEG", quality=quality)
                    jpeg_buf = buf.getvalue()
                
                # 推送二進制幀 (不使用 Base64 與 JSON)
                frame_count += 1
                try:
                    await websocket.send(jpeg_buf)
                except websockets.exceptions.ConnectionClosed:
                    break

                # 檢查是否有前端指令 (非阻塞)
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=0.001)
                    cmd = json.loads(msg)
                    cmd_action = cmd.get("action", "")
                    
                    if cmd_action == "stop":
                        print("[串流] 前端要求停止")
                        break
                    elif cmd_action == "update_config":
                        fps = cmd.get("fps", fps)
                        quality = cmd.get("quality", quality)
                        interval = 1.0 / fps
                        print(f"[設定] 更新 FPS={fps}, 品質={quality}")
                    elif cmd_action in ("click", "click_pct", "click_roi", "key", "type_text", "hotkey", "move", "drag", "focus", "ocr_rois", "log"):
                        # ── 處理控制指令（串流中也能控制）──
                        result = handle_control_command(cmd, active_source=source)
                        try:
                            resp = {"type": "control_result", **result}
                            if "requestId" in cmd:
                                resp["requestId"] = cmd["requestId"]
                            await websocket.send(json.dumps(resp))
                        except:
                            pass
                        if result["success"] and cmd_action != "log":
                            print(f"[控制] {result['message']}")
                        elif not result["success"]:
                            print(f"[控制錯誤] {result['message']}")
                except asyncio.TimeoutError:
                    pass

                # 控制幀率
                elapsed = time.time() - loop_start
                sleep_time = max(0, interval - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        # 清理
        active_sources.pop(ws_id, None)

        elapsed_total = time.time() - start_time
        avg_fps = frame_count / elapsed_total if elapsed_total > 0 else 0
        print(f"[結束] 共 {frame_count} 幀, 平均 {avg_fps:.1f} FPS")

    except websockets.exceptions.ConnectionClosed:
        print(f"[斷線] 前端已斷開連線")
    except Exception as e:
        print(f"[錯誤] {e}")
        try:
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
        except:
            pass


async def handle_control_session(websocket, config):
    """
    純控制模式：持續監聽控制指令，不串流畫面。
    用於前端開啟獨立的控制通道（與串流通道分離）。
    """
    source = config.get("source", None)
    print(f"[控制] 進入純控制模式, 來源={source}")

    try:
        # 回報連線成功與能力
        await websocket.send(json.dumps({
            "type": "control_ready",
            "capabilities": {
                "control": HAS_PYAUTOGUI,
                "actions": ["click", "click_pct", "click_roi", "key", "type_text", "hotkey", "move", "drag", "focus"]
                    if HAS_PYAUTOGUI else []
            }
        }))

        async for message in websocket:
            try:
                cmd = json.loads(message)
                cmd_action = cmd.get("action", "")

                if cmd_action == "stop":
                    print("[控制] 前端要求停止")
                    break
                elif cmd_action == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
                else:
                    result = handle_control_command(cmd, active_source=source)
                    await websocket.send(json.dumps({
                        "type": "control_result",
                        "requestId": cmd.get("requestId"),
                        **result
                    }))
                    if result["success"]:
                        print(f"[控制] {result['message']}")
                    else:
                        print(f"[控制錯誤] {result['message']}")
            except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "control_result",
                    "success": False,
                    "message": "JSON 解析錯誤"
                }))

    except websockets.exceptions.ConnectionClosed:
        print("[控制] 前端已斷開連線")


async def main():
    port = 8765
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    print("=" * 50)
    print("  螢幕擷取 + 遊戲控制 WebSocket 伺服器")
    print(f"  ws://localhost:{port}")
    print("=" * 50)
    print()
    print(f"  控制引擎: {'✓ pyautogui 已就緒' if HAS_PYAUTOGUI else '✗ 未安裝 (pip install pyautogui)'}")
    print()

    # 列出可用螢幕
    with mss.MSS() as sct:
        for i, m in enumerate(sct.monitors):
            label = "所有螢幕 (合併)" if i == 0 else f"螢幕 {i}"
            print(f"  [{i}] {label}: {m['width']}x{m['height']} @ ({m['left']}, {m['top']})")
    print()
    print("等待前端連線...")
    print()

    async with websockets.serve(handle_client, "localhost", port):
        await asyncio.Future()  # 永遠執行


if __name__ == "__main__":
    asyncio.run(main())
