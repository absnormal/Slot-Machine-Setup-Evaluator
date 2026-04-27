"""
螢幕擷取 WebSocket 伺服器
─────────────────────────
用途：繞過 Chrome getDisplayMedia 限制，
      使用 Windows 原生 API 擷取螢幕/視窗畫面，
      透過 WebSocket 將 JPEG 幀推送到瀏覽器前端。

擷取引擎：
  - 螢幕模式：mss (DXGI，高效能)
  - 視窗模式：PrintWindow API (支援被遮擋的視窗)

啟動方式：python server.py
預設埠號：ws://localhost:8765
"""

import asyncio
import json
import base64
import io
import sys
import time

import websockets
import mss
from PIL import Image
import ctypes
import ctypes.wintypes

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

            await websocket.send(json.dumps({
                "type": "monitors",
                "data": sources
            }))
            print(f"[資訊] 回傳 {len(sources)} 個來源資訊")

            # 等待前端選擇螢幕後的 start 指令
            raw = await websocket.recv()
            config = json.loads(raw)

        # ── 2. 開始串流 ──
        source = config.get("source", {"type": "monitor", "index": 1})
        fps = config.get("fps", 15)
        quality = config.get("quality", 60)
        # 可選：僅擷取指定區域 (相對於來源的裁切)
        crop = config.get("crop", None)

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

                # 壓縮為 JPEG
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=quality)
                
                # 推送二進制幀 (不使用 Base64 與 JSON)
                frame_count += 1
                try:
                    await websocket.send(buf.getvalue())
                except websockets.exceptions.ConnectionClosed:
                    break

                # 檢查是否有前端指令 (非阻塞)
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=0.001)
                    cmd = json.loads(msg)
                    if cmd.get("action") == "stop":
                        print("[串流] 前端要求停止")
                        break
                    elif cmd.get("action") == "update_config":
                        fps = cmd.get("fps", fps)
                        quality = cmd.get("quality", quality)
                        interval = 1.0 / fps
                        print(f"[設定] 更新 FPS={fps}, 品質={quality}")
                except asyncio.TimeoutError:
                    pass

                # 控制幀率
                elapsed = time.time() - loop_start
                sleep_time = max(0, interval - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

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


async def main():
    port = 8765
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass

    print("=" * 50)
    print("  螢幕擷取 WebSocket 伺服器")
    print(f"  ws://localhost:{port}")
    print("=" * 50)
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
