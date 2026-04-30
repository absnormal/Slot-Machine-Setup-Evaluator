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

    setReelROI: (v) => { const val = typeof v === 'function' ? v(get().reelROI) : v; set({ reelROI: val }); saveROI('reel', val); },
    setWinROI: (v) => { const val = typeof v === 'function' ? v(get().winROI) : v; set({ winROI: val }); saveROI('win', val); },
    setBalanceROI: (v) => { const val = typeof v === 'function' ? v(get().balanceROI) : v; set({ balanceROI: val }); saveROI('balance', val); },
    setBetROI: (v) => { const val = typeof v === 'function' ? v(get().betROI) : v; set({ betROI: val }); saveROI('bet', val); },
    setOrderIdROI: (v) => { const val = typeof v === 'function' ? v(get().orderIdROI) : v; set({ orderIdROI: val }); saveROI('orderId', val); },
    setMultiplierROI: (v) => { const val = typeof v === 'function' ? v(get().multiplierROI) : v; set({ multiplierROI: val }); saveROI('multiplier', val); },

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
        };
    },
}));

export default usePhase4Store;
