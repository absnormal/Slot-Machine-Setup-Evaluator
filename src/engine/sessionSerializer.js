/**
 * sessionSerializer.js — Session 匯出（JSON 序列化）與匯入（反序列化 + 圖片重建）
 *
 * 從 useReportGenerator.js 抽出 (Phase A — SRP 重構)
 * 純非同步函數，無 React 依賴
 */

import { parallelMap, canvasToBlobUrl } from '../utils/asyncUtils';

// ═══════════════════════════════════════════════════════════
// 匯出 (Serialize)
// ═══════════════════════════════════════════════════════════

/**
 * 將 candidates 序列化為可匯出的 JSON 資料
 * @param {Array} candidates - 原始候選幀陣列（含 canvas / thumbUrl 等 DOM 物件）
 * @param {Object|null} rois - ROI 座標快照
 * @returns {{ jsonBlob: Blob, jsonFileName: string }}
 */
export function serializeSession(candidates, rois, gameName = 'slot') {
    const validCandidates = candidates.filter(c => c.ocrData || c.recognitionResult || c.isSpinBest);

    const exportedCandidates = validCandidates.map(c => ({
        id: c.id,
        time: c.time,
        status: c.status,
        diff: c.diff,
        avgDiff: c.avgDiff,
        ocrData: c.ocrData || null,
        manualOverrides: c.manualOverrides || null,
        recognitionResult: c.recognitionResult || null,
        spinGroupId: c.spinGroupId,
        isSpinBest: c.isSpinBest,
        isCascadeMember: c.isCascadeMember || false,
        cascadeDeltaWin: c.cascadeDeltaWin || 0,
        captureDelay: c.captureDelay || 0,
        reelStopTime: c.reelStopTime || c.time,
        winPollTime: c.winPollTime || null,
        // 圖片檔名對照（匯入時用來讀回圖片）
        imageFile: c.canvas ? `spin_${c.time.toFixed(2)}s_${c.id}` : (c.thumbUrl ? `spin_${c.time.toFixed(2)}s_${c.id}` : null),
        winPollImageFile: c.winPollCanvas ? `winpoll_${c.time.toFixed(2)}s_${c.id}` : null,
    }));

    const jsonData = {
        version: 2,
        rois: rois || null,
        candidates: exportedCandidates
    };

    const jsonBlob = new Blob([JSON.stringify(jsonData)], { type: 'application/json;charset=utf-8;' });
    const jsonFileName = `${gameName}_Session_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;

    return { jsonBlob, jsonFileName };
}

// ═══════════════════════════════════════════════════════════
// 匯入 (Deserialize)
// ═══════════════════════════════════════════════════════════

/**
 * 產生縮圖（使用 blob URL 取代 toDataURL，快 3x）
 * @param {HTMLCanvasElement} canvas
 * @param {Object|null} roi - { x, y, w, h } 百分比
 * @returns {Promise<string>} blob URL
 */
async function generateThumbBlobUrl(canvas, roi) {
    if (!roi) return canvasToBlobUrl(canvas, 'image/jpeg', 0.6);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = canvas.width * (roi.w / 100);
    thumbCanvas.height = canvas.height * (roi.h / 100);
    const ctx = thumbCanvas.getContext('2d');
    ctx.drawImage(canvas,
        canvas.width * (roi.x / 100), canvas.height * (roi.y / 100), thumbCanvas.width, thumbCanvas.height,
        0, 0, thumbCanvas.width, thumbCanvas.height
    );
    return canvasToBlobUrl(thumbCanvas, 'image/jpeg', 0.6);
}

/**
 * 從資料夾匯入歷史 Session（JSON + 圖片）→ 還原成 candidates 陣列
 * @param {Function|null} onProgress - 進度回呼 ({ phase, current, total, detail })
 * @returns {Promise<{ candidates: Array, dirHandle: FileSystemDirectoryHandle, rois: Object|null } | null>}
 */
export async function importSession(onProgress = null) {
    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });

        onProgress?.({ phase: '解析 JSON 檔案', current: 0, total: 0, detail: '' });

        // 1. 找 JSON 檔
        let jsonData = null;
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.name.includes('Session')) {
                const file = await entry.getFile();
                onProgress?.({ phase: '解析 JSON 檔案', current: 0, total: 0, detail: entry.name });
                const text = await file.text();
                jsonData = JSON.parse(text);
                break;
            }
        }
        if (!jsonData) {
            alert('⚠️ 在所選資料夾中找不到有效的 Session JSON 檔');
            return null;
        }

        // 支援舊版 Array 格式與新版 Object 格式
        let loadedCandidates = [];
        let loadedRois = null;
        if (Array.isArray(jsonData)) {
            loadedCandidates = jsonData;
        } else if (jsonData.candidates && Array.isArray(jsonData.candidates)) {
            loadedCandidates = jsonData.candidates;
            loadedRois = jsonData.rois;
        } else {
            alert('⚠️ Session JSON 檔格式不正確');
            return null;
        }

        onProgress?.({ phase: '建立圖片索引', current: 0, total: loadedCandidates.length, detail: `共 ${loadedCandidates.length} 筆資料` });

        // 2. 建立圖片索引（不含副檔名的檔名 → FileHandle）
        const imageIndex = new Map();
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && /\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
                // 去掉副檔名作為 key
                const baseName = entry.name.replace(/\.[^.]+$/, '');
                imageIndex.set(baseName, entry);
            }
        }

        // 讀取截圖所需的 Reel ROI，優先用載入檔案中的，如果沒有再用本地快取的
        let cachedReelROI = null;
        if (loadedRois && loadedRois.reel) {
            cachedReelROI = loadedRois.reel;
        } else {
            try {
                const saved = JSON.parse(localStorage.getItem('SLOT_P4_ROI_V2') || '{}');
                if (saved.reel) cachedReelROI = saved.reel;
            } catch (e) {}
        }

        // 3. 逐筆還原 candidate（受控並行，concurrency=8）
        const candidates = await parallelMap(loadedCandidates, async (item) => {
            // 讀盤面圖片
            let canvas = null;
            let thumbUrl = '';
            if (item.imageFile && imageIndex.has(item.imageFile)) {
                try {
                    const imgFile = await imageIndex.get(item.imageFile).getFile();
                    const imgBitmap = await createImageBitmap(imgFile);
                    canvas = document.createElement('canvas');
                    canvas.width = imgBitmap.width;
                    canvas.height = imgBitmap.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(imgBitmap, 0, 0);
                    thumbUrl = await generateThumbBlobUrl(canvas, cachedReelROI);
                } catch (e) {
                    console.warn(`圖片 ${item.imageFile} 讀取失敗`, e);
                }
            }

            // 讀 WIN 特工圖片
            let winPollCanvas = null;
            let winPollThumbUrl = '';
            if (item.winPollImageFile && imageIndex.has(item.winPollImageFile)) {
                try {
                    const wpFile = await imageIndex.get(item.winPollImageFile).getFile();
                    const wpBitmap = await createImageBitmap(wpFile);
                    winPollCanvas = document.createElement('canvas');
                    winPollCanvas.width = wpBitmap.width;
                    winPollCanvas.height = wpBitmap.height;
                    const wpCtx = winPollCanvas.getContext('2d');
                    wpCtx.drawImage(wpBitmap, 0, 0);
                    winPollThumbUrl = await generateThumbBlobUrl(winPollCanvas, cachedReelROI);
                } catch (e) {
                    console.warn(`WIN 特工圖片 ${item.winPollImageFile} 讀取失敗`, e);
                }
            }

            return {
                id: item.id,
                time: item.time,
                canvas,
                thumbUrl,
                diff: item.diff,
                avgDiff: item.avgDiff,
                status: item.status || 'pending',
                ocrData: item.ocrData || null,
                manualOverrides: item.manualOverrides || null,
                recognitionResult: item.recognitionResult || null,
                error: '',
                spinGroupId: item.spinGroupId,
                isSpinBest: item.isSpinBest,
                isCascadeMember: item.isCascadeMember || false,
                cascadeDeltaWin: item.cascadeDeltaWin || 0,
                isFGSequence: item.isFGSequence || false,
                captureDelay: item.captureDelay || 0,
                reelStopTime: item.reelStopTime || item.time,
                winPollCanvas,
                winPollThumbUrl,
                winPollTime: item.winPollTime || null,
            };
        }, 8, (prog) => {
            onProgress?.({ phase: '讀取圖片並產生縮圖', current: prog.current, total: prog.total, detail: prog.item?.imageFile || '' });
        });

        onProgress?.({ phase: '完成', current: candidates.length, total: candidates.length, detail: '' });
        return { candidates, dirHandle, rois: loadedRois };
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('匯入歷史資料失敗', e);
            alert('⚠️ 匯入失敗：' + e.message);
        }
        return null;
    }
}
