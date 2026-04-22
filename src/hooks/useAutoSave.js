import { useState, useRef, useEffect } from 'react';

/**
 * useAutoSave — 截圖自動存檔 hook
 * 管理存檔目錄選取、自動寫入磁碟、以及智慧刪重時的檔案清理
 */
const useAutoSave = (candidates, confirmDedup) => {
    // ── 截圖存檔狀態 (自動存入磁碟) ──
    const [rootSaveDirHandle, setRootSaveDirHandle] = useState(null);
    const [saveDirHandle, setSaveDirHandle] = useState(null);
    const [saveCount, setSaveCount] = useState(0);
    const [saveFormat, setSaveFormat] = useState('jpeg'); // 'jpeg' | 'png'
    const savedIdsRef = useRef(new Set());

    const handlePickSaveDir = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setRootSaveDirHandle(handle);
            setSaveDirHandle(null); // 換了 root 就清除原本的 saveDir
            setSaveCount(0);
            savedIdsRef.current.clear();
        } catch (e) {
            console.log("使用者取消選取目錄", e);
        }
    };

    // 自動存檔 useEffect
    useEffect(() => {
        if (!saveDirHandle) return;
        candidates.forEach(async (kf) => {
            // ── 存盤面截圖 ──
            if (!savedIdsRef.current.has(kf.id) && kf.canvas) {
                savedIdsRef.current.add(kf.id);
                try {
                    const mimeType = saveFormat === 'png' ? 'image/png' : 'image/jpeg';
                    const ext = saveFormat === 'png' ? 'png' : 'jpg';
                    const blob = await new Promise(r => kf.canvas.toBlob(r, mimeType, 0.92));
                    const prefix = kf.id.startsWith('win-') ? 'win_' : 'spin_';
                    const fileName = `${prefix}${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    kf.canvas = null; // 釋放記憶體
                    setSaveCount(prev => prev + 1);
                } catch (e) {
                    console.error('自動存檔失敗:', e);
                }
            }
            // ── 存 WIN 特工截圖 ──
            const wpKey = `wp_${kf.id}`;
            if (!savedIdsRef.current.has(wpKey) && kf.winPollCanvas) {
                savedIdsRef.current.add(wpKey);
                try {
                    const mimeType = saveFormat === 'png' ? 'image/png' : 'image/jpeg';
                    const ext = saveFormat === 'png' ? 'png' : 'jpg';
                    const blob = await new Promise(r => kf.winPollCanvas.toBlob(r, mimeType, 0.92));
                    const fileName = `winpoll_${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    const fileHandle = await saveDirHandle.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    // 不釋放 winPollCanvas，報表匯出時還需要
                    setSaveCount(prev => prev + 1);
                } catch (e) {
                    console.error('WIN 特工截圖存檔失敗:', e);
                }
            }
        });
    }, [candidates, saveDirHandle, saveFormat]);

    // ── 智慧刪除（含資料夾圖片清理）──
    const handleConfirmDedup = async () => {
        // 先找出即將被刪除的候選幀（isSpinBest === false）
        const toRemove = candidates.filter(c => c.isSpinBest === false);

        // 如果有選擇資料夾，嘗試刪除對應的截圖檔
        if (saveDirHandle && toRemove.length > 0) {
            const exts = ['jpg', 'jpeg', 'png'];
            let deletedCount = 0;
            for (const kf of toRemove) {
                for (const ext of exts) {
                    const prefix = kf.id.startsWith('win-') ? 'win_' : 'spin_';
                    const fileName = `${prefix}${kf.time.toFixed(2)}s_${kf.id}.${ext}`;
                    try {
                        await saveDirHandle.removeEntry(fileName);
                        deletedCount++;
                    } catch (e) {
                        // 檔案不存在或無權限，靜默跳過
                    }
                }
            }
            if (deletedCount > 0) {
                console.log(`🗑️ 已從資料夾刪除 ${deletedCount} 張被淘汰的截圖`);
            }
        }

        // 再執行原本的 confirmDedup（從 state 中移除非最佳候選幀）
        confirmDedup();
    };

    return {
        rootSaveDirHandle, setRootSaveDirHandle,
        saveDirHandle, setSaveDirHandle,
        saveCount, setSaveCount,
        saveFormat, setSaveFormat,
        savedIdsRef,
        handlePickSaveDir,
        handleConfirmDedup,
    };
};

export default useAutoSave;
