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
 * 6. UI 模式 (簡易/完整)
 */
const useAppStore = create((set, get) => ({
    // === UI 模式 (簡易/完整) ===
    uiMode: typeof window !== 'undefined'
        ? (localStorage.getItem('slot_ui_mode') || 'simple')
        : 'simple',

    setUiMode: (mode) => {
        set({ uiMode: mode });
        if (typeof window !== 'undefined') localStorage.setItem('slot_ui_mode', mode);
    },

    // === Phase 展開/收合 ===
    isTemplateMinimized: false,
    isPhase2Minimized: true,
    isPhase3Minimized: true,
    isPhase4Minimized: true,
    isPhase5Minimized: true,

    setIsTemplateMinimized: (v) => set({ isTemplateMinimized: typeof v === 'function' ? v(get().isTemplateMinimized) : v }),
    setIsPhase2Minimized: (v) => set({ isPhase2Minimized: typeof v === 'function' ? v(get().isPhase2Minimized) : v }),
    setIsPhase3Minimized: (v) => set({ isPhase3Minimized: typeof v === 'function' ? v(get().isPhase3Minimized) : v }),
    setIsPhase4Minimized: (v) => set({ isPhase4Minimized: typeof v === 'function' ? v(get().isPhase4Minimized) : v }),
    setIsPhase5Minimized: (v) => set({ isPhase5Minimized: typeof v === 'function' ? v(get().isPhase5Minimized) : v }),

    /** 手風琴切換：展開指定 Phase、收合所有其他 */
    handlePhaseToggle: (phaseKey) => {
        const state = get();
        const isCurrentlyMinimized = {
            phase1: state.isTemplateMinimized,
            phase2: state.isPhase2Minimized,
            phase3: state.isPhase3Minimized,
            phase4: state.isPhase4Minimized,
            phase5: state.isPhase5Minimized,
        }[phaseKey];

        if (isCurrentlyMinimized) {
            set({
                isTemplateMinimized: phaseKey !== 'phase1',
                isPhase2Minimized: phaseKey !== 'phase2',
                isPhase3Minimized: phaseKey !== 'phase3',
                isPhase4Minimized: phaseKey !== 'phase4',
                isPhase5Minimized: phaseKey !== 'phase5',
            });
        } else {
            if (phaseKey === 'phase1') set({ isTemplateMinimized: true });
            else if (phaseKey === 'phase2') set({ isPhase2Minimized: true });
            else if (phaseKey === 'phase3') set({ isPhase3Minimized: true });
            else if (phaseKey === 'phase4') set({ isPhase4Minimized: true });
            else if (phaseKey === 'phase5') set({ isPhase5Minimized: true });
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

    // === 資料表（P5 表格驅動自動化）===
    // dataTables: { tableName: { name, fileName, headers, rows } }
    dataTables: {},
    // resultTables: { tableName: [{ col1: val1, col2: val2 }, ...] }
    resultTables: {},

    addDataTable: (tableName, data) => set(state => ({
        dataTables: { ...state.dataTables, [tableName]: data }
    })),
    removeDataTable: (tableName) => set(state => {
        const next = { ...state.dataTables };
        delete next[tableName];
        return { dataTables: next };
    }),
    renameDataTable: (oldName, newName) => set(state => {
        if (oldName === newName || !state.dataTables[oldName]) return {};
        const next = { ...state.dataTables };
        next[newName] = { ...next[oldName], name: newName };
        delete next[oldName];
        return { dataTables: next };
    }),
    clearAllDataTables: () => set({ dataTables: {} }),

    appendResult: (tableName, row) => set(state => ({
        resultTables: {
            ...state.resultTables,
            [tableName]: [...(state.resultTables[tableName] || []), row],
        }
    })),
    clearResults: (tableName) => set(state => {
        if (tableName) {
            return { resultTables: { ...state.resultTables, [tableName]: [] } };
        }
        return { resultTables: {} };
    }),
    getResultRows: (tableName) => get().resultTables[tableName] || [],

}));

export default useAppStore;
