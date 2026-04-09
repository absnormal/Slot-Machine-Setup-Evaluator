import { create } from 'zustand';

/**
 * useAppStore — 全域 UI / 佈局 / 設定狀態
 * 
 * 此 store 管理跨元件共用的狀態，取代 App.jsx → Phase 元件的 prop drilling：
 * 1. Phase 手風琴展開/收合
 * 2. Toast 訊息
 * 3. 資產餘額
 * 4. API Key 設定
 * 5. Modal 開關
 */
const useAppStore = create((set, get) => ({
    // === Phase 展開/收合 ===
    isTemplateMinimized: false,
    isPhase2Minimized: true,
    isPhase3Minimized: true,
    isPhase4Minimized: true,

    setIsTemplateMinimized: (v) => set({ isTemplateMinimized: typeof v === 'function' ? v(get().isTemplateMinimized) : v }),
    setIsPhase2Minimized: (v) => set({ isPhase2Minimized: typeof v === 'function' ? v(get().isPhase2Minimized) : v }),
    setIsPhase3Minimized: (v) => set({ isPhase3Minimized: typeof v === 'function' ? v(get().isPhase3Minimized) : v }),
    setIsPhase4Minimized: (v) => set({ isPhase4Minimized: typeof v === 'function' ? v(get().isPhase4Minimized) : v }),

    /** 手風琴切換：展開指定 Phase、收合所有其他 */
    handlePhaseToggle: (phaseKey) => {
        const state = get();
        const isCurrentlyMinimized = {
            phase1: state.isTemplateMinimized,
            phase2: state.isPhase2Minimized,
            phase3: state.isPhase3Minimized,
            phase4: state.isPhase4Minimized,
        }[phaseKey];

        if (isCurrentlyMinimized) {
            set({
                isTemplateMinimized: phaseKey !== 'phase1',
                isPhase2Minimized: phaseKey !== 'phase2',
                isPhase3Minimized: phaseKey !== 'phase3',
                isPhase4Minimized: phaseKey !== 'phase4',
            });
        } else {
            if (phaseKey === 'phase1') set({ isTemplateMinimized: true });
            else if (phaseKey === 'phase2') set({ isPhase2Minimized: true });
            else if (phaseKey === 'phase3') set({ isPhase3Minimized: true });
            else if (phaseKey === 'phase4') set({ isPhase4Minimized: true });
        }
    },

    // === Toast 訊息 ===
    templateMessage: '',
    setTemplateMessage: (msg) => set({ templateMessage: msg }),
    /** 設定訊息並在指定毫秒後自動清除 */
    showToast: (msg, durationMs = 3000) => {
        set({ templateMessage: msg });
        if (durationMs > 0) {
            setTimeout(() => {
                // 只清除自己發出的訊息，避免覆蓋後來者
                if (get().templateMessage === msg) set({ templateMessage: '' });
            }, durationMs);
        }
    },

    // === 資產餘額 ===
    totalBalance: (() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('slot_total_balance') : null;
        return saved ? parseFloat(saved) : 0;
    })(),
    isBalanceExpanded: false,

    setTotalBalance: (v) => {
        const newVal = typeof v === 'function' ? v(get().totalBalance) : v;
        set({ totalBalance: newVal });
        if (typeof window !== 'undefined') localStorage.setItem('slot_total_balance', newVal.toString());
    },
    setIsBalanceExpanded: (v) => set({ isBalanceExpanded: typeof v === 'function' ? v(get().isBalanceExpanded) : v }),

    // === API Key / 設定 ===
    customApiKey: typeof window !== 'undefined' ? (localStorage.getItem('gemini_api_key') || '') : '',
    showSettingsModal: false,
    isDarkMode: typeof window !== 'undefined' ? (localStorage.getItem('slot_dark_mode') === 'true') : false,

    setCustomApiKey: (v) => set({ customApiKey: v }),
    setShowSettingsModal: (v) => set({ showSettingsModal: v }),
    setIsDarkMode: (v) => {
        set({ isDarkMode: v });
        if (typeof window !== 'undefined') localStorage.setItem('slot_dark_mode', v.toString());
    },

    // === 雲端模板 Modal ===
    showCloudModal: false,
    setShowCloudModal: (v) => set({ showCloudModal: v }),

}));

export default useAppStore;
