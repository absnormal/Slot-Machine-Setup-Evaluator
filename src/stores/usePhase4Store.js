import { create } from 'zustand';

/**
 * usePhase4Store — Phase 4 專屬全域狀態
 *
 * 管理 ROI 框選位置與偵測參數，全部自動持久化至 localStorage。
 * 取代原本 App.jsx 中 ~30 行的 useState + useCallback + localStorage 邏輯。
 */

const ROI_CACHE_KEY = 'SLOT_P4_ROI_V2';

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

const usePhase4Store = create((set, get) => ({
    // ═══════════════════════════════════════
    // ROI 狀態（6 組）
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
    clickTargets: loadCachedROI('clickTargets', {}),

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
}));

export default usePhase4Store;

