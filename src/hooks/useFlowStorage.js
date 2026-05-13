/**
 * useFlowStorage.js — 流程配方的本地 + 雲端存取
 *
 * 模式完全參考 useCloud.js 的 GAS 架構：
 *   - list: 列出所有流程
 *   - save: 儲存新流程
 *   - update: 覆蓋已有流程
 *   - delete: 刪除流程
 *   - getFlow: 取得完整流程
 *
 * 額外支援 localStorage 作為離線快取。
 */
import { useState, useCallback, useEffect } from 'react';
import { GAS_URL } from '../utils/constants';
import { PRESET_FLOWS } from '../engine/flowRunner';

const LS_KEY = 'slot_flow_recipes';
const CACHE_KEY = 'slot_flows_cloud_cache';

// ── localStorage 工具 ──
function loadLocal() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch { return []; }
}
function saveLocal(flows) {
    localStorage.setItem(LS_KEY, JSON.stringify(flows));
}

export function useFlowStorage() {
    // 合併來源：預設 + 本地 + 雲端
    const [localFlows, setLocalFlows] = useState(() => loadLocal());
    const [cloudFlows, setCloudFlows] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    // 同步 localStorage
    useEffect(() => { saveLocal(localFlows); }, [localFlows]);

    // ═══════════════════════════════════════
    // 雲端操作（GAS）
    // ═══════════════════════════════════════

    const fetchCloudFlows = useCallback(async () => {
        if (!GAS_URL) return;

        // 先用快取
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            try { setCloudFlows(JSON.parse(cached)); } catch { }
        }

        setIsLoading(true);
        try {
            const res = await fetch(`${GAS_URL}?action=listFlows&nocache=true&t=${Date.now()}`);
            const data = await res.json();
            const flows = data || [];
            setCloudFlows(flows);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(flows));
        } catch (err) {
            console.warn('[FlowStorage] 雲端讀取失敗', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const saveToCloud = useCallback(async (flow) => {
        if (!GAS_URL) {
            setError('尚未設定 GAS_URL');
            return false;
        }
        setIsSaving(true);
        setError('');
        try {
            const isUpdate = flow._cloudId;
            const id = isUpdate ? flow._cloudId : `flow_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
            const payload = {
                action: isUpdate ? 'updateFlow' : 'saveFlow',
                data: {
                    id,
                    name: flow.name,
                    version: flow.version || 1,
                    blocks: flow.blocks,
                    createdAt: flow.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                }
            };

            const res = await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            setMessage(isUpdate ? '✅ 雲端流程已更新' : '✅ 已儲存至雲端');
            setTimeout(() => setMessage(''), 3000);
            sessionStorage.removeItem(CACHE_KEY);
            fetchCloudFlows();
            return true;
        } catch (err) {
            setError('雲端儲存失敗：' + err.message);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [fetchCloudFlows]);

    const deleteFromCloud = useCallback(async (id) => {
        if (!GAS_URL) return;
        try {
            await fetch(GAS_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'deleteFlow', id }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });
            setCloudFlows(prev => prev.filter(f => f.id !== id));
            sessionStorage.removeItem(CACHE_KEY);
            setMessage('✅ 雲端流程已刪除');
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setError('刪除失敗：' + err.message);
        }
    }, []);

    // ═══════════════════════════════════════
    // 本地操作
    // ═══════════════════════════════════════

    const saveToLocal = useCallback((flow) => {
        const id = flow.id || `local_${Date.now()}`;
        const entry = {
            id,
            name: flow.name,
            version: flow.version || 1,
            blocks: flow.blocks,
            createdAt: flow.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        setLocalFlows(prev => {
            const idx = prev.findIndex(f => f.id === id);
            if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = entry;
                return updated;
            }
            return [...prev, entry];
        });
        setMessage('✅ 已儲存至本地');
        setTimeout(() => setMessage(''), 2000);
        return id;
    }, []);

    const deleteFromLocal = useCallback((id) => {
        setLocalFlows(prev => prev.filter(f => f.id !== id));
        setMessage('✅ 本地流程已刪除');
        setTimeout(() => setMessage(''), 2000);
    }, []);

    // ═══════════════════════════════════════
    // 合併列表（預設 + 本地 + 雲端）
    // ═══════════════════════════════════════

    const allFlows = [
        ...PRESET_FLOWS.map(f => ({ ...f, _source: 'preset' })),
        ...localFlows.map(f => ({ ...f, _source: 'local' })),
        ...cloudFlows.map(f => ({ ...f, _source: 'cloud' })),
    ];

    return {
        allFlows,
        presetFlows: PRESET_FLOWS,
        localFlows,
        cloudFlows,
        isLoading,
        isSaving,
        error,
        message,
        setError,
        setMessage,

        // 本地
        saveToLocal,
        deleteFromLocal,

        // 雲端
        fetchCloudFlows,
        saveToCloud,
        deleteFromCloud,

        hasCloud: !!GAS_URL,
    };
}
