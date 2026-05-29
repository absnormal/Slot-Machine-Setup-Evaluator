import { create } from 'zustand';

/**
 * usePhase4Store — Phase 4 專屬全域狀態
 *
 * 管理 ROI 框選位置與偵測參數，全部自動持久化至 localStorage。
 */

const ROI_CACHE_KEY = 'SLOT_P4_ROI_V2';

// ═══════════════════════════════════════
// 預設 ROI 群組
// ═══════════════════════════════════════
const DEFAULT_ROI_GROUPS = [
    { id: 'game',     label: '遊戲' },
    { id: 'card',     label: '遊戲介面' },
    { id: 'history',  label: '遊戲歷程' },
    { id: 'admin',    label: '後台塞卡' },
    { id: 'platform', label: '後台簽核' },
];

// 7 個固定 ROI 預設所屬群組
const FIXED_ROI_DEFAULT_GROUP = 'game';

/** 從 localStorage 讀取指定 ROI key 的快取值 */
const loadCachedROI = (key, fallback) => {
    try {
        const saved = JSON.parse(localStorage.getItem(ROI_CACHE_KEY))?.[key];
        return saved || fallback;
    } catch {
        return fallback;
    }
};

/** 將指定 ROI key 寫入 localStorage */
const saveROI = (key, val) => {
    try {
        const all = JSON.parse(localStorage.getItem(ROI_CACHE_KEY) || '{}');
        all[key] = val;
        localStorage.setItem(ROI_CACHE_KEY, JSON.stringify(all));
    } catch { /* silent */ }
};

/**
 * 確保 clickTargets 中的每個 target 都有 group 欄位（相容舊資料）
 */
const migrateClickTargets = (targets) => {
    if (!targets || typeof targets !== 'object') return {};
    const migrated = {};
    for (const [name, roi] of Object.entries(targets)) {
        if (!roi.group) {
            migrated[name] = { ...roi, group: 'card' }; // 舊資料預設歸入「道具卡」
        } else {
            migrated[name] = roi;
        }
    }
    return migrated;
};

const usePhase4Store = create((set, get) => ({
    // ═══════════════════════════════════════
    // ROI 群組管理
    // ═══════════════════════════════════════
    roiGroups: loadCachedROI('roiGroups', DEFAULT_ROI_GROUPS),

    /** 新增群組 */
    addRoiGroup: (label) => {
        const groups = get().roiGroups;
        const id = label.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
        const next = [...groups, { id, label }];
        set({ roiGroups: next });
        saveROI('roiGroups', next);
        return id;
    },

    /** 重命名群組 */
    renameRoiGroup: (groupId, newLabel) => {
        const next = get().roiGroups.map(g => g.id === groupId ? { ...g, label: newLabel } : g);
        set({ roiGroups: next });
        saveROI('roiGroups', next);
    },

    /** 刪除群組（將其下 ROI 移至第一個群組） */
    removeRoiGroup: (groupId) => {
        const groups = get().roiGroups;
        if (groups.length <= 1) return; // 至少保留一個
        const fallbackGroup = groups.find(g => g.id !== groupId)?.id || 'game';
        const next = groups.filter(g => g.id !== groupId);
        set({ roiGroups: next });
        saveROI('roiGroups', next);
        // 將該群組的 clickTarget 移至 fallback
        const targets = { ...get().clickTargets };
        let changed = false;
        for (const [name, roi] of Object.entries(targets)) {
            if (roi.group === groupId) {
                targets[name] = { ...roi, group: fallbackGroup };
                changed = true;
            }
        }
        if (changed) {
            set({ clickTargets: targets });
            saveROI('clickTargets', targets);
        }
    },

    // ═══════════════════════════════════════
    // 群組顯示/隱藏
    // ═══════════════════════════════════════
    visibleGroups: loadCachedROI('visibleGroups', ['game']),

    toggleGroupVisibility: (groupId) => {
        const current = get().visibleGroups;
        const next = current.includes(groupId)
            ? current.filter(g => g !== groupId)
            : [...current, groupId];
        set({ visibleGroups: next });
        saveROI('visibleGroups', next);
    },

    setVisibleGroups: (groups) => {
        set({ visibleGroups: groups });
        saveROI('visibleGroups', groups);
    },

    // ═══════════════════════════════════════
    // 固定 ROI 群組映射
    // ═══════════════════════════════════════
    fixedRoiGroups: loadCachedROI('fixedRoiGroups', {
        reel: FIXED_ROI_DEFAULT_GROUP,
        win: FIXED_ROI_DEFAULT_GROUP,
        balance: FIXED_ROI_DEFAULT_GROUP,
        bet: FIXED_ROI_DEFAULT_GROUP,
        orderId: FIXED_ROI_DEFAULT_GROUP,
        multiplier: FIXED_ROI_DEFAULT_GROUP,
        spinButton: FIXED_ROI_DEFAULT_GROUP,
    }),

    setFixedRoiGroup: (roiKey, groupId) => {
        const next = { ...get().fixedRoiGroups, [roiKey]: groupId };
        set({ fixedRoiGroups: next });
        saveROI('fixedRoiGroups', next);
    },

    // ═══════════════════════════════════════
    // ROI 狀態（7 組）
    // ═══════════════════════════════════════
    reelROI: loadCachedROI('reel', { x: 10, y: 15, w: 80, h: 55 }),
    winROI: loadCachedROI('win', { x: 38, y: 72, w: 24, h: 8 }),
    balanceROI: loadCachedROI('balance', { x: 5, y: 90, w: 24, h: 6 }),
    betROI: loadCachedROI('bet', { x: 70, y: 90, w: 24, h: 6 }),
    orderIdROI: loadCachedROI('orderId', { x: 40, y: 5, w: 20, h: 5 }),
    multiplierROI: loadCachedROI('multiplier', { x: 45, y: 5, w: 10, h: 8 }),
    spinButtonROI: loadCachedROI('spinButton', { x: 90, y: 85, w: 8, h: 8 }),

    setReelROI: (v) => { const val = typeof v === 'function' ? v(get().reelROI) : v; set({ reelROI: val }); saveROI('reel', val); },
    setWinROI: (v) => { const val = typeof v === 'function' ? v(get().winROI) : v; set({ winROI: val }); saveROI('win', val); },
    setBalanceROI: (v) => { const val = typeof v === 'function' ? v(get().balanceROI) : v; set({ balanceROI: val }); saveROI('balance', val); },
    setBetROI: (v) => { const val = typeof v === 'function' ? v(get().betROI) : v; set({ betROI: val }); saveROI('bet', val); },
    setOrderIdROI: (v) => { const val = typeof v === 'function' ? v(get().orderIdROI) : v; set({ orderIdROI: val }); saveROI('orderId', val); },
    setMultiplierROI: (v) => { const val = typeof v === 'function' ? v(get().multiplierROI) : v; set({ multiplierROI: val }); saveROI('multiplier', val); },
    setSpinButtonROI: (v) => { const val = typeof v === 'function' ? v(get().spinButtonROI) : v; set({ spinButtonROI: val }); saveROI('spinButton', val); },

    // ═══════════════════════════════════════
    // 偵測參數
    // ═══════════════════════════════════════
    ocrDecimalPlaces: 2,
    setOcrDecimalPlaces: (v) => set({ ocrDecimalPlaces: typeof v === 'function' ? v(get().ocrDecimalPlaces) : v }),

    balDecimalPlaces: 2,
    setBalDecimalPlaces: (v) => set({ balDecimalPlaces: typeof v === 'function' ? v(get().balDecimalPlaces) : v }),

    enableBidirectional: false,
    setEnableBidirectional: (v) => set({ enableBidirectional: typeof v === 'function' ? v(get().enableBidirectional) : v }),

    enableWinTracker: true, // WIN 變化追蹤器
    setEnableWinTracker: (v) => set({ enableWinTracker: typeof v === 'function' ? v(get().enableWinTracker) : v }),
    enableEmptyBoardFilter: false,  // 空盤過濾：σ < 35 跳過空白盤面
    setEnableEmptyBoardFilter: (v) => set({ enableEmptyBoardFilter: typeof v === 'function' ? v(get().enableEmptyBoardFilter) : v }),

    motionCoverageMin: 60,
    setMotionCoverageMin: (v) => set({ motionCoverageMin: typeof v === 'function' ? v(get().motionCoverageMin) : v }),

    vLineThreshold: 0.25,
    setVLineThreshold: (v) => set({ vLineThreshold: typeof v === 'function' ? v(get().vLineThreshold) : v }),

    // ═══════════════════════════════════════
    // 便利取值器（供 hook 非 React 上下文使用）
    // ═══════════════════════════════════════
    /** 取得所有 ROI 的快照物件 */
    getRois: () => {
        const s = get();
        return {
            reelROI: s.reelROI,
            winROI: s.winROI,
            balanceROI: s.balanceROI,
            betROI: s.betROI,
            orderIdROI: s.orderIdROI,
            multiplierROI: s.multiplierROI,
            spinButtonROI: s.spinButtonROI,
        };
    },

    // ═══════════════════════════════════════
    // 動態點擊目標（遊戲層）
    // ═══════════════════════════════════════
    clickTargets: migrateClickTargets(loadCachedROI('clickTargets', {})),

    setClickTarget: (name, roi) => {
        const targets = { ...get().clickTargets, [name]: roi };
        set({ clickTargets: targets });
        saveROI('clickTargets', targets);
    },

    removeClickTarget: (name) => {
        const targets = { ...get().clickTargets };
        delete targets[name];
        set({ clickTargets: targets });
        saveROI('clickTargets', targets);
    },

    setClickTargets: (targets) => {
        set({ clickTargets: targets });
        saveROI('clickTargets', targets);
    },

    // ═══════════════════════════════════════
    // 平台層點擊目標（依 platformName 存 localStorage）
    // ═══════════════════════════════════════
    platformName: '',
    setPlatformName: (v) => set({ platformName: v }),

    /** 取得平台層點擊目標 */
    getPlatformClickTargets: () => {
        const pName = get().platformName;
        if (!pName) return {};
        try {
            return JSON.parse(localStorage.getItem(`slot_platform_clicks_${pName}`) || '{}');
        } catch { return {}; }
    },

    /** 設定平台層單一點擊目標 */
    setPlatformClickTarget: (name, roi) => {
        const pName = get().platformName;
        if (!pName) return;
        const key = `slot_platform_clicks_${pName}`;
        try {
            const targets = JSON.parse(localStorage.getItem(key) || '{}');
            targets[name] = roi;
            localStorage.setItem(key, JSON.stringify(targets));
        } catch { /* silent */ }
    },

    /** 刪除平台層單一點擊目標 */
    removePlatformClickTarget: (name) => {
        const pName = get().platformName;
        if (!pName) return;
        const key = `slot_platform_clicks_${pName}`;
        try {
            const targets = JSON.parse(localStorage.getItem(key) || '{}');
            delete targets[name];
            localStorage.setItem(key, JSON.stringify(targets));
        } catch { /* silent */ }
    },

    /** 合併取得所有點擊目標（平台 + 遊戲，遊戲層優先覆蓋） */
    getAllClickTargets: () => {
        const s = get();
        const platform = s.getPlatformClickTargets();
        const game = s.clickTargets || {};
        return { ...platform, ...game }; // 遊戲層覆蓋同名
    },

    /**
     * 取得 ROI 名稱的群組標籤（供積木顯示用）
     * @param {string} roiName - ROI 名稱（如 'SPIN', '背包'）
     * @returns {string} 群組標籤（如 '遊戲'）
     */
    getGroupLabel: (roiName) => {
        const s = get();
        const groups = s.roiGroups;
        // 固定 ROI
        const fixedMap = { 'SPIN': 'spinButton', 'REEL': 'reel', 'WIN': 'win', 'BAL': 'balance', 'BALANCE': 'balance', 'BET': 'bet', 'ORDER_ID': 'orderId', 'ORDERID': 'orderId', 'MULT': 'multiplier', 'MULTIPLIER': 'multiplier' };
        const fixedKey = fixedMap[roiName?.toUpperCase()];
        if (fixedKey) {
            const gid = s.fixedRoiGroups[fixedKey] || FIXED_ROI_DEFAULT_GROUP;
            return groups.find(g => g.id === gid)?.label || gid;
        }
        // 動態 clickTarget
        const all = s.getAllClickTargets();
        const target = all[roiName];
        if (target?.group) {
            return groups.find(g => g.id === target.group)?.label || target.group;
        }
        return '';
    },

    // ═══════════════════════════════════════
    // ROI 匯出 / 匯入
    // ═══════════════════════════════════════

    /** 匯出所有 ROI 設定為 JSON 檔案下載 */
    exportAllROIs: () => {
        const s = get();
        const data = {
            _version: 3,
            _exportedAt: new Date().toISOString(),
            reel: s.reelROI,
            win: s.winROI,
            balance: s.balanceROI,
            bet: s.betROI,
            orderId: s.orderIdROI,
            multiplier: s.multiplierROI,
            spinButton: s.spinButtonROI,
            clickTargets: s.clickTargets || {},
            roiGroups: s.roiGroups,
            fixedRoiGroups: s.fixedRoiGroups,
            visibleGroups: s.visibleGroups,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ROI_設定_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    /** 匯入 ROI 設定（從 JSON 檔案） */
    importAllROIs: (jsonData) => {
        if (!jsonData || typeof jsonData !== 'object') throw new Error('無效的 ROI 設定檔');

        const roiMap = {
            reel:       { setter: 'reelROI',       key: 'reel' },
            win:        { setter: 'winROI',        key: 'win' },
            balance:    { setter: 'balanceROI',    key: 'balance' },
            bet:        { setter: 'betROI',        key: 'bet' },
            orderId:    { setter: 'orderIdROI',    key: 'orderId' },
            multiplier: { setter: 'multiplierROI', key: 'multiplier' },
            spinButton: { setter: 'spinButtonROI', key: 'spinButton' },
        };

        const updates = {};
        for (const [jsonKey, { setter, key }] of Object.entries(roiMap)) {
            if (jsonData[jsonKey] && typeof jsonData[jsonKey] === 'object') {
                updates[setter] = jsonData[jsonKey];
                saveROI(key, jsonData[jsonKey]);
            }
        }

        if (jsonData.clickTargets && typeof jsonData.clickTargets === 'object') {
            updates.clickTargets = migrateClickTargets(jsonData.clickTargets);
            saveROI('clickTargets', updates.clickTargets);
        }

        // v3: 匯入群組設定
        if (jsonData.roiGroups && Array.isArray(jsonData.roiGroups)) {
            updates.roiGroups = jsonData.roiGroups;
            saveROI('roiGroups', jsonData.roiGroups);
        }
        if (jsonData.fixedRoiGroups && typeof jsonData.fixedRoiGroups === 'object') {
            updates.fixedRoiGroups = jsonData.fixedRoiGroups;
            saveROI('fixedRoiGroups', jsonData.fixedRoiGroups);
        }
        if (jsonData.visibleGroups && Array.isArray(jsonData.visibleGroups)) {
            updates.visibleGroups = jsonData.visibleGroups;
            saveROI('visibleGroups', jsonData.visibleGroups);
        }

        set(updates);
    },
}));

export default usePhase4Store;
export { DEFAULT_ROI_GROUPS };
