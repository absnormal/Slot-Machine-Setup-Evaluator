import { useState, useCallback } from 'react';
import { GAS_URL } from '../utils/constants';
import { resizeImageBase64 } from '../utils/helpers';

export function useCloud() {
    const [cloudTemplates, setCloudTemplates] = useState([]);
    const [isLoadingCloud, setIsLoadingCloud] = useState(false);
    const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [cloudError, setCloudError] = useState('');
    const [cloudMessage, setCloudMessage] = useState('');

    const fetchCloudTemplates = useCallback(async () => {
        if (!GAS_URL) return;

        const cachedStr = sessionStorage.getItem('slot_templates_cache');
        if (cachedStr) {
            try {
                setCloudTemplates(JSON.parse(cachedStr));
                setIsBackgroundSyncing(true);
            } catch (e) { }
        } else {
            setIsLoadingCloud(true);
        }

        try {
            const res = await fetch(`${GAS_URL}?action=list`);
            const data = await res.json();
            setCloudTemplates(data || []);
            sessionStorage.setItem('slot_templates_cache', JSON.stringify(data || []));
        } catch (err) {
            console.warn("取得雲端資料失敗", err);
        } finally {
            setIsLoadingCloud(false);
            setIsBackgroundSyncing(false);
        }
    }, []);

    const handleForceRefreshCloud = async () => {
        if (!GAS_URL) return;
        setIsLoadingCloud(true);
        sessionStorage.removeItem('slot_templates_cache');
        try {
            const res = await fetch(`${GAS_URL}?action=list&nocache=true&t=${Date.now()}`);
            const data = await res.json();
            setCloudTemplates(data || []);
            sessionStorage.setItem('slot_templates_cache', JSON.stringify(data || []));
            setCloudMessage('✅ 雲端資料已強制更新！');
            setTimeout(() => setCloudMessage(''), 3000);
        } catch (err) {
            console.error("強制更新失敗", err);
            setCloudError("強制更新失敗：" + err.message);
        } finally {
            setIsLoadingCloud(false);
        }
    };

    const handleDeleteTemplate = async (id) => {
        if (!GAS_URL) return;
        try {
            setDeletingId(id);
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', id: id }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            setCloudTemplates(prev => prev.filter(t => t.id !== id));
            sessionStorage.removeItem('slot_templates_cache');
            setDeletingId(null);
        } catch (err) {
            console.warn("刪除失敗", err);
            setCloudError('刪除失敗：' + err.message);
            setDeletingId(null);
        }
    };

    const getTemplateData = async (id) => {
        setDownloadingId(id);
        try {
            const res = await fetch(`${GAS_URL}?action=getTemplate&id=${id}&nocache=true&t=${Date.now()}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            return data;
        } catch (err) {
            console.warn(err);
            setCloudError("載入模板詳細資料失敗：" + err.message);
            throw err;
        } finally {
            setDownloadingId(null);
        }
    };

    const saveTemplateToCloud = async ({
        templateName, generatedName,
        platformName, gameName, gridRows, gridCols, lineMode, extractResults,
        paytableInput, ptResultItems, jpConfig, hasJackpot, hasMultiplierReel,
        localUserId, actualForceId
    }) => {
        setCloudMessage('');
        setCloudError('');

        if (lineMode === 'paylines' && extractResults.length === 0) {
            setCloudError('沒有可儲存的連線資料，請先完成提取！');
            return { success: false, conflict: false };
        }
        if (!GAS_URL) {
            setCloudError('尚未設定 Google Sheets 連線網址，請在程式碼中填寫 GAS_URL！');
            return { success: false, conflict: false };
        }

        const linesLabel = lineMode === 'allways' ? `${Math.pow(gridRows, gridCols)} Ways` : `${extractResults.length} 線`;
        const name = templateName.trim() || generatedName || `模板 ${gridRows}x${gridCols} (${linesLabel})`;

        // 若非強制動作，先檢查是否有重複 (同平台+同遊戲)
        if (!actualForceId) {
            const existing = cloudTemplates.find(t =>
                t.platformName?.trim().toUpperCase() === platformName?.trim().toUpperCase() &&
                t.gameName?.trim().toUpperCase() === gameName?.trim().toUpperCase()
            );
            if (existing) {
                return { conflict: true, existing, newName: name };
            }
        }

        setIsSaving(true);
        try {
            const isUpdating = actualForceId && actualForceId !== 'FORCE_NEW';
            const targetId = isUpdating ? actualForceId : (Date.now().toString() + Math.random().toString(36).substring(2, 7));
            const action = isUpdating ? 'update' : 'save';

            // --- 壓縮縮圖以節省空間 (Google Sheets 單格上限 50KB) ---
            const cloudPtResultItems = await Promise.all(ptResultItems.map(async (item) => {
                if (!item.thumbUrls || item.thumbUrls.length === 0) return item;
                const compressedThumbs = await Promise.all(item.thumbUrls.slice(0, 3).map(async (url) => {
                    try {
                        if (url.length < 2000) return url;
                        const res = await resizeImageBase64(url, 48, 0.4, 'image/jpeg');
                        return `data:image/jpeg;base64,${res.base64}`;
                    } catch { return url.substring(0, 100); }
                }));
                return { ...item, thumbUrls: compressedThumbs };
            }));

            const newTemplate = {
                id: targetId,
                name,
                platformName,
                gameName,
                gridRows,
                gridCols,
                lineMode,
                extractResults,
                paytableInput,
                ptResultItems: cloudPtResultItems,
                jpConfig: hasJackpot ? jpConfig : {},
                hasMultiplierReel,
                creatorId: localUserId,
                createdAt: new Date().toISOString()
            };

            const payload = JSON.stringify({ action, data: newTemplate });
            console.log(`[CloudSave] Action: ${action}, ID: ${targetId}, Payload: ${payload.length} chars`);

            if (payload.length > 49000) {
                throw new Error('模板資料過大 (超過 50KB)，請減少符號縮圖再試。');
            }

            const response = await fetch(GAS_URL.trim(), {
                method: 'POST',
                body: payload,
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

            setCloudMessage(isUpdating ? '✅ 雲端模板已成功覆蓋更新！' : '✅ 已成功儲存至 Google Sheets！');
            setTimeout(() => setCloudMessage(''), 3000);

            sessionStorage.removeItem('slot_templates_cache');
            fetchCloudTemplates();

            return { success: true, conflict: false };
        } catch (e) {
            console.error('[CloudSave] Error:', e);
            setCloudError('雲端儲存失敗：' + e.message);
            return { success: false, conflict: false };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        cloudTemplates,
        isLoadingCloud,
        isBackgroundSyncing,
        isSaving,
        deletingId,
        setDeletingId,
        downloadingId,
        cloudError,
        cloudMessage,
        setCloudError,
        setCloudMessage,
        fetchCloudTemplates,
        handleForceRefreshCloud,
        handleDeleteTemplate,
        getTemplateData,
        saveTemplateToCloud
    };
}
