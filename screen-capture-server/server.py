"""
螢幕擷取 WebSocket 伺服器
─────────────────────────
用途：繞過 Chrome getDisplayMedia 限制，
      使用 Windows 原生 DXGI API 擷取螢幕畫面，
      透過 WebSocket 將 JPEG 幀推送到瀏覽器前端。

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


async def handle_client(websocket):
    """處理單一 WebSocket 連線"""
    print(f"[連線] 前端已連線: {websocket.remote_address}")

    try:
        # ── 1. 等待前端的設定指令 ──
        raw = await websocket.recv()
        config = json.loads(raw)
        action = config.get("action", "start")

        if action == "list_monitors":
            # 回傳可用螢幕列表
            with mss.MSS() as sct:
                monitors = []
                for i, m in enumerate(sct.monitors):
                    monitors.append({
                        "index": i,
                        "left": m["left"],
                        "top": m["top"],
                        "width": m["width"],
                        "height": m["height"],
                        "label": "所有螢幕 (合併)" if i == 0 else f"螢幕 {i} ({m['width']}x{m['height']})"
                    })
            await websocket.send(json.dumps({
                "type": "monitors",
                "data": monitors
            }))
            print(f"[資訊] 回傳 {len(monitors)} 個螢幕資訊")

            # 等待前端選擇螢幕後的 start 指令
            raw = await websocket.recv()
            config = json.loads(raw)

        # ── 2. 開始串流 ──
        monitor_index = config.get("monitor", 1)
        fps = config.get("fps", 15)
        quality = config.get("quality", 60)
        # 可選：僅擷取指定區域 (前端可傳入 crop: {x, y, w, h})
        crop = config.get("crop", None)

        interval = 1.0 / fps
        frame_count = 0
        start_time = time.time()

        print(f"[串流] 開始擷取 螢幕={monitor_index}, FPS={fps}, 品質={quality}")

        with mss.MSS() as sct:
            monitor = sct.monitors[monitor_index]

            while True:
                loop_start = time.time()

                # 擷取螢幕
                img = sct.grab(monitor)

                # 轉換為 PIL Image
                pil_img = Image.frombytes("RGB", img.size, img.bgra, "raw", "BGRX")

                # 如果有裁切設定
                if crop:
                    pil_img = pil_img.crop((
                        crop["x"], crop["y"],
                        crop["x"] + crop["w"],
                        crop["y"] + crop["h"]
                    ))

                # 壓縮為 JPEG
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=quality)
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")

                # 推送幀
                frame_count += 1
                try:
                    await websocket.send(json.dumps({
                        "type": "frame",
                        "data": b64,
                        "width": pil_img.width,
                        "height": pil_img.height,
                        "frame": frame_count
                    }))
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
