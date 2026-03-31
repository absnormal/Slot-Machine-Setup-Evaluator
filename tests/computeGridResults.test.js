import { describe, it, expect } from 'vitest';
import { computeGridResults } from '../src/engine/computeGridResults';

// ============================================================
// 輔助函式：快速建立模板
// ============================================================

/**
 * 建立固定線獎模板
 * @param {Object} paytable - { symbolName: [match1, match2, match3, match4, match5] }
 * @param {Object} lines - { lineId: [row positions 1-indexed] }
 * @param {Object} opts - 額外選項
 */
function makePaylineTemplate(paytable, lines, opts = {}) {
    const firstLine = Object.values(lines)[0] || [1, 1, 1, 1, 1];
    return {
        rows: opts.rows || 3,
        cols: opts.cols || firstLine.length,
        lineMode: 'paylines',
        lines,
        paytable,
        symbolImages: {},
        symbolImagesAll: {},
        jpConfig: opts.jpConfig || {},
        hasMultiplierReel: opts.hasMultiplierReel || false,
        hasDoubleSymbol: opts.hasDoubleSymbol || false,
        hasDynamicMultiplier: opts.hasDynamicMultiplier || false,
        multiplierCalcType: opts.multiplierCalcType || 'product',
        requiresCollectToWin: opts.requiresCollectToWin !== undefined ? opts.requiresCollectToWin : true,
        ...opts,
    };
}

/**
 * 建立 All Ways 模板
 */
function makeAllWaysTemplate(paytable, opts = {}) {
    return {
        rows: opts.rows || 3,
        cols: opts.cols || 5,
        lineMode: 'allways',
        lines: {},
        paytable,
        symbolImages: {},
        symbolImagesAll: {},
        jpConfig: opts.jpConfig || {},
        hasMultiplierReel: opts.hasMultiplierReel || false,
        hasDoubleSymbol: opts.hasDoubleSymbol || false,
        hasDynamicMultiplier: opts.hasDynamicMultiplier || false,
        multiplierCalcType: opts.multiplierCalcType || 'product',
        requiresCollectToWin: opts.requiresCollectToWin !== undefined ? opts.requiresCollectToWin : true,
        ...opts,
    };
}

/**
 * 建立 Symbol Count 模板
 */
function makeSymbolCountTemplate(paytable, opts = {}) {
    return {
        rows: opts.rows || 3,
        cols: opts.cols || 5,
        lineMode: 'symbolcount',
        lines: {},
        paytable,
        symbolImages: {},
        symbolImagesAll: {},
        jpConfig: opts.jpConfig || {},
        hasMultiplierReel: opts.hasMultiplierReel || false,
        hasDoubleSymbol: opts.hasDoubleSymbol || false,
        hasDynamicMultiplier: opts.hasDynamicMultiplier || false,
        multiplierCalcType: opts.multiplierCalcType || 'product',
        requiresCollectToWin: opts.requiresCollectToWin !== undefined ? opts.requiresCollectToWin : true,
        ...opts,
    };
}

// ============================================================
// 1. 邊界情況 / 防呆
// ============================================================
describe('邊界情況 (Edge Cases)', () => {
    it('template 為 null 時回傳空結果且無錯誤', () => {
        const { results, error } = computeGridResults(null, [['A']], 100);
        expect(results).toBeNull();
        expect(error).toBe('');
    });

    it('targetGrid 為 null 時回傳空結果且無錯誤', () => {
        const t = makePaylineTemplate({ A: [0, 0, 10] }, { 1: [1, 1, 1] });
        const { results, error } = computeGridResults(t, null, 100);
        expect(results).toBeNull();
        expect(error).toBe('');
    });

    it('押注金額為 0 時回傳錯誤', () => {
        const t = makePaylineTemplate({ A: [0, 0, 10] }, { 1: [1, 1, 1] });
        const grid = [['A', 'A', 'A']];
        const { results, error } = computeGridResults(t, grid, 0);
        expect(results).toBeNull();
        expect(error).toContain('押注金額');
    });

    it('押注金額為負數時回傳錯誤', () => {
        const t = makePaylineTemplate({ A: [0, 0, 10] }, { 1: [1, 1, 1] });
        const grid = [['A', 'A', 'A']];
        const { results, error } = computeGridResults(t, grid, -50);
        expect(results).toBeNull();
        expect(error).toContain('押注金額');
    });

    it('押注金額為非數字字串時回傳錯誤', () => {
        const t = makePaylineTemplate({ A: [0, 0, 10] }, { 1: [1, 1, 1] });
        const grid = [['A', 'A', 'A']];
        const { results, error } = computeGridResults(t, grid, 'abc');
        expect(results).toBeNull();
        expect(error).toContain('押注金額');
    });

    it('空盤面（全空字串）應無中獎', () => {
        const t = makePaylineTemplate({ A: [0, 0, 10] }, { 1: [1, 1, 1] }, { rows: 1 });
        const grid = [['', '', '']];
        const { results, error } = computeGridResults(t, grid, 100);
        expect(error).toBe('');
        expect(results.totalWin).toBe(0);
    });
});

// ============================================================
// 2. 固定線獎 (Paylines)
// ============================================================
describe('固定線獎 (Paylines)', () => {
    const paytable = {
        A: [0, 0, 5, 20, 50],    // 3連=5, 4連=20, 5連=50
        B: [0, 0, 3, 10, 30],
        WILD: [0, 0, 10, 40, 100],
    };

    // 3x5 盤面, 3 條線
    const lines = {
        1: [2, 2, 2, 2, 2],  // 中間橫線
        2: [1, 1, 1, 1, 1],  // 上方橫線
        3: [3, 3, 3, 3, 3],  // 下方橫線
    };

    it('5 連線 A 應正確結算', () => {
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['B', 'B', 'B', 'B', 'B'],
            ['A', 'A', 'A', 'A', 'A'],
            ['B', 'B', 'B', 'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        // 線 1 (中間): A x5 = 50 * 100 = 5000
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.symbol).toBe('A');
        expect(line1.count).toBe(5);
        expect(line1.winAmount).toBe(5000);
        // 線 2 和線 3 都是 B x5 = 30*100 = 3000 各一條
        expect(results.totalWin).toBe(5000 + 3000 + 3000);
    });

    it('3 連線 A (前 3 個匹配) 應正確結算', () => {
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['B', 'B', 'B', 'B', 'B'],
            ['A', 'A', 'A', 'B', 'B'],
            ['B', 'B', 'B', 'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.symbol).toBe('A');
        expect(line1.count).toBe(3);
        expect(line1.winAmount).toBe(500); // 5 * 100
    });

    it('無中獎時 winAmount 應為 0', () => {
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['A', 'B', 'A', 'B', 'A'],
            ['B', 'A', 'B', 'A', 'B'],
            ['A', 'B', 'A', 'B', 'A'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        expect(results.totalWin).toBe(0);
    });

    it('多條線同時中獎應累加', () => {
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['A', 'A', 'A', 'A', 'A'],  // 線2: A x5
            ['B', 'B', 'B', 'B', 'B'],  // 線1: B x5
            ['A', 'A', 'A', 'B', 'B'],  // 線3: A x3
        ];
        const { results } = computeGridResults(t, grid, 100);
        // 線2: A x5 = 50*100=5000, 線1: B x5 = 30*100=3000, 線3: A x3 = 5*100=500
        expect(results.totalWin).toBe(5000 + 3000 + 500);
    });

    it('線獎取最佳符號（同一條線上多種可能時）', () => {
        // A 和 WILD 都在賠率表中, WILD 的 3 連是 10 (比 A 的 5 高)
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1, 1, 1] }, { rows: 1 });
        const grid = [['WILD', 'WILD', 'WILD', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // B x5 (WILD+WILD+WILD+B+B, WILD替代B) = 30*100=3000
        // 比 WILD x3 = 10*100=1000 和 A x3 = 5*100=500 都高，所以取 B
        expect(line1.symbol).toBe('B');
        expect(line1.winAmount).toBe(3000);
    });
});

// ============================================================
// 3. WILD 替代邏輯
// ============================================================
describe('WILD 替代邏輯', () => {
    const paytable = {
        A: [0, 0, 5, 20, 50],
        B: [0, 0, 3, 10, 30],
        WILD: [0, 0, 10, 40, 100],
    };
    const lines = { 1: [1, 1, 1, 1, 1] };

    it('WILD 應可替代普通符號形成連線', () => {
        const t = makePaylineTemplate(paytable, lines, { rows: 1 });
        const grid = [['A', 'WILD', 'A', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // A, WILD(=A), A = A x3 = 5*100=500
        expect(line1.symbol).toBe('A');
        expect(line1.count).toBe(3);
        expect(line1.winAmount).toBe(500);
    });

    it('全 WILD 連線應以 WILD 自身賠率結算', () => {
        const t = makePaylineTemplate(paytable, lines, { rows: 1 });
        const grid = [['WILD', 'WILD', 'WILD', 'WILD', 'WILD']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.symbol).toBe('WILD');
        expect(line1.winAmount).toBe(10000); // 100 * 100
    });

    it('WILD 開頭接普通符號應正確結算', () => {
        const t = makePaylineTemplate(paytable, lines, { rows: 1 });
        const grid = [['WILD', 'WILD', 'B', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // B x5 (WILD+WILD+B+B+B) = 30*100=3000
        expect(line1.symbol).toBe('B');
        expect(line1.count).toBe(5);
        expect(line1.winAmount).toBe(3000);
    });

    it('帶 WILD 前綴的符號也應被視為 WILD (如 WILD_元寶)', () => {
        const t = makePaylineTemplate(
            { A: [0, 0, 5], 'WILD_元寶': [0, 0, 10] },
            { 1: [1, 1, 1] },
            { rows: 1 }
        );
        const grid = [['A', 'WILD_元寶', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.symbol).toBe('A');
        expect(line1.count).toBe(3);
    });
});

// ============================================================
// 4. All Ways 基本結算
// ============================================================
describe('All Ways 結算', () => {
    const paytable = {
        A: [0, 0, 5, 20, 50],
        B: [0, 0, 3, 10, 30],
        WILD: [0, 0, 10, 40, 100],
    };

    it('3x3 全 A 應有 27 ways (3^3) 結算 3 連', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 3, cols: 3 });
        const grid = [
            ['A', 'A', 'A'],
            ['A', 'A', 'A'],
            ['A', 'A', 'A'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult).toBeTruthy();
        expect(aResult.ways).toBe(27); // 3*3*3
        expect(aResult.winAmount).toBe(5 * 100 * 27); // payoutMult * bet * ways
    });

    it('只有前 2 行有 A 時應結算 2 連', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 3, cols: 5 });
        const grid = [
            ['A', 'A', 'B', 'B', 'B'],
            ['A', 'A', 'B', 'B', 'B'],
            ['A', 'A', 'B', 'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        // A 出現在前 2 行, 但 paytable 中 2 連是 0, 所以不中獎
        // (paytable A = [0, 0, 5, 20, 50], index 1 = 0)
        const aResult = results.details.find(r => r.symbol === 'A');
        // 2 連的 A 賠率為 0，不應產生結果
        if (aResult) {
            expect(aResult.winAmount).toBe(0);
        }
    });

    it('不同行內 A 和 WILD 混合的 ways 計算', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 3, cols: 3 });
        const grid = [
            ['A',    'A', 'A'],
            ['WILD', 'B', 'B'],
            ['B',    'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        // col0: A+WILD=2 matches, col1: A only=1, col2: A only=1
        // ways = 2*1*1 = 2, but need to check pure WILD deduction
        // pure WILD: col0 has 1 WILD, col1 has 0 WILD → not possible → no deduction
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult).toBeTruthy();
        expect(aResult.ways).toBe(2);
        expect(aResult.winAmount).toBe(5 * 100 * 2); // 1000
    });
});

// ============================================================
// 5. Pure WILD 扣除 (All Ways 專用)
// ============================================================
describe('Pure WILD 扣除 (All Ways)', () => {
    const paytable = {
        A: [0, 0, 5, 20, 50],
        WILD: [0, 0, 10, 40, 100],
    };

    it('3x3 每行都有 A 和 WILD 時，應正確扣除純 WILD 路線', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 3, cols: 3 });
        const grid = [
            ['A',    'A',    'A'],
            ['WILD', 'WILD', 'WILD'],
            ['B',    'B',    'B'],  // B 不在 paytable... 讓我改
        ];
        // 用更清晰的例子
        const grid2 = [
            ['A',    'A',    'A'],
            ['WILD', 'WILD', 'WILD'],
        ];
        const t2 = makeAllWaysTemplate(paytable, { rows: 2, cols: 3 });
        const { results } = computeGridResults(t2, grid2, 100);
        // 對 A 來說: col0: A+WILD=2, col1: A+WILD=2, col2: A+WILD=2
        // 總 ways = 2*2*2 = 8
        // 純 WILD 路線: col0: 1 WILD, col1: 1 WILD, col2: 1 WILD → 1*1*1 = 1
        // 扣除後: 8 - 1 = 7
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult.ways).toBe(7);
    });

    it('WILD 符號本身不應被扣除純 WILD 路線', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 2, cols: 3 });
        const grid = [
            ['A',    'A',    'A'],
            ['WILD', 'WILD', 'WILD'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const wildResult = results.details.find(r => r.symbol === 'WILD');
        // WILD 自己: col0: WILD=1 (A is not WILD), col1: WILD=1, col2: WILD=1
        // Actually for WILD symbol: A is not WILD base, WILD is WILD base
        // col0: matches = A(isWild? no, but base=A != WILD) + WILD(isWild=yes) = only WILD
        // Wait - for WILD symbol evaluation: base === 'WILD' || isWildSymbol(sym)
        // A's base is 'A', so A does NOT match WILD target. Only WILD matches.
        // So WILD: col0=1, col1=1, col2=1 → ways=1, no pure wild deduction (it IS the wild symbol)
        expect(wildResult.ways).toBe(1);
    });

    it('只有一行全是 WILD 無其他匹配時不應影響非 WILD 符號', () => {
        const t = makeAllWaysTemplate(paytable, { rows: 2, cols: 3 });
        const grid = [
            ['WILD', 'WILD', 'WILD'],
            ['B',    'B',    'B'],  // B 不在 paytable
        ];
        // A 完全不在盤面, 不應有 A 的結果
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        // A: col0 = WILD matches (1), col1 = WILD (1), col2 = WILD (1)
        // ways = 1, pure wild deduction: all are WILD → 1, so ways = 1-1 = 0
        // ways <= 0 means no win
        expect(!aResult || aResult.winAmount === 0 || aResult.ways === 0).toBe(true);
    });
});

// ============================================================
// 6. Symbol Count (消除模式)
// ============================================================
describe('Symbol Count 結算', () => {
    const paytable = {
        // index:   0  1  2  3  4  5  6  7 (8個=8符號)
        A: [0, 0, 0, 0, 0, 0, 0, 5, 10],
        B: [0, 0, 0, 0, 1, 2, 3, 4, 5],
    };

    it('盤面上 8 個 A 應觸發結算', () => {
        const t = makeSymbolCountTemplate(paytable, { rows: 3, cols: 5 });
        const grid = [
            ['A', 'A', 'A', 'A', 'A'],
            ['A', 'A', 'A', 'B', 'B'],
            ['B', 'B', 'B', 'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult).toBeTruthy();
        expect(aResult.count).toBe(8);
        // payIndex = min(8-1, 8) = 7 → paytable[7] = 5
        expect(aResult.winAmount).toBe(5 * 100);
    });

    it('WILD 也應被計入符號消除數量', () => {
        const t = makeSymbolCountTemplate(
            { A: [0, 0, 0, 0, 5], WILD: [0, 0, 0, 0, 10] },
            { rows: 1, cols: 5 }
        );
        const grid = [['A', 'WILD', 'A', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult.count).toBe(5); // 4A + 1WILD
    });

    it('數量不足以觸發賠率時不應中獎', () => {
        const t = makeSymbolCountTemplate(
            { A: [0, 0, 0, 0, 5] }, // 至少 5 個才有賠率
            { rows: 1, cols: 5 }
        );
        const grid = [['A', 'A', 'A', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        // 只有 3 個 A, paytable[2] = 0
        expect(!aResult || aResult.winAmount === 0).toBe(true);
    });
});

// ============================================================
// 7. SCATTER 計算
// ============================================================
describe('SCATTER 計算', () => {
    it('盤面上 3 個 SCATTER 應正確結算', () => {
        const paytable = {
            A: [0, 0, 5],
            SCATTER: [0, 0, 20, 50, 100],
        };
        const t = makePaylineTemplate(paytable, { 1: [2, 2, 2, 2, 2] });
        const grid = [
            ['SCATTER', 'B', 'SCATTER', 'B', 'SCATTER'],
            ['A',       'A', 'A',       'A', 'A'],
            ['B',       'B', 'B',       'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const scatter = results.details.find(r => r.symbol === 'SCATTER');
        expect(scatter).toBeTruthy();
        expect(scatter.count).toBe(3);
        expect(scatter.winAmount).toBe(20 * 100); // 2000
    });

    it('SCATTER 不應被固定線獎列入計算', () => {
        const paytable = {
            A: [0, 0, 5],
            SCATTER: [0, 0, 20],
        };
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1] }, { rows: 1 });
        const grid = [['SCATTER', 'SCATTER', 'SCATTER']];
        const { results } = computeGridResults(t, grid, 100);
        // 線獎不應包含 SCATTER 的結果
        const lineResults = results.details.filter(r => !String(r.lineId).startsWith('SCATTER'));
        const scatterOnLine = lineResults.find(r => r.symbol === 'SCATTER');
        expect(scatterOnLine).toBeFalsy();
        // SCATTER 應獨立計算
        const scatter = results.details.find(r => String(r.lineId).startsWith('SCATTER'));
        expect(scatter).toBeTruthy();
        expect(scatter.winAmount).toBe(20 * 100);
    });

    it('帶 SCATTER 前綴的符號應被識別 (如 SCATTER_錢幣)', () => {
        const paytable = {
            A: [0, 0, 5],
            'SCATTER_錢幣': [0, 0, 20],
        };
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1] }, { rows: 1 });
        const grid = [['SCATTER_錢幣', 'A', 'SCATTER_錢幣']];
        const { results } = computeGridResults(t, grid, 100);
        // SCATTER 應只看盤面上出現的數量
        const scatter = results.details.find(r => r.symbol === 'SCATTER_錢幣');
        expect(scatter).toBeTruthy();
        expect(scatter.count).toBe(2);
    });
});

// ============================================================
// 8. CASH / COLLECT 計算
// ============================================================
describe('CASH / COLLECT 計算', () => {
    it('COLLECT + CASH 應正確結算收集功能', () => {
        const paytable = { A: [0, 0, 5] };
        const t = makePaylineTemplate(paytable, { 1: [2, 2, 2, 2, 2] }, {
            requiresCollectToWin: true,
            jpConfig: {},
        });
        const grid = [
            ['COLLECT', 'CASH_500', 'CASH_200', 'B', 'B'],
            ['A',       'A',        'A',        'A', 'A'],
            ['B',       'B',        'B',        'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const collect = results.details.find(r => r.lineId === 'COLLECT_FEATURE');
        expect(collect).toBeTruthy();
        // CASH_500 = 500, CASH_200 = 200 → total = 700
        // 1 COLLECT → factor = 1
        // payout = 700 * 1 = 700
        expect(collect.winAmount).toBe(700);
    });

    it('無 COLLECT 且 requiresCollectToWin=true 時 CASH 不應結算', () => {
        const paytable = { A: [0, 0, 5] };
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1, 1, 1] }, {
            rows: 1,
            requiresCollectToWin: true,
        });
        const grid = [['CASH_500', 'CASH_200', 'A', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const collect = results.details.find(r => r.lineId === 'COLLECT_FEATURE');
        expect(collect).toBeFalsy();
    });

    it('requiresCollectToWin=false 時即使沒有 COLLECT 也應自動收集', () => {
        const paytable = { A: [0, 0, 5] };
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1, 1, 1] }, {
            rows: 1,
            requiresCollectToWin: false,
        });
        const grid = [['CASH_500', 'CASH_200', 'A', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const collect = results.details.find(r => r.lineId === 'COLLECT_FEATURE');
        expect(collect).toBeTruthy();
        expect(collect.winAmount).toBe(700);
    });

    it('JP 符號應按 jpConfig 倍率乘以 BET 結算', () => {
        const paytable = { A: [0, 0, 5] };
        const jpConfig = { GRAND: '1000', MINI: '10' };
        const t = makePaylineTemplate(paytable, { 1: [1, 1, 1, 1, 1] }, {
            rows: 1,
            requiresCollectToWin: true,
            jpConfig,
        });
        // GRAND is a JP symbol, value=1000, payout = 1000 * BET
        const grid = [['COLLECT', 'GRAND', 'A', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const collect = results.details.find(r => r.lineId === 'COLLECT_FEATURE');
        expect(collect).toBeTruthy();
        // GRAND value = 1000, is JP so payout = 1000 * 100(bet) = 100000
        // 1 COLLECT → factor = 1
        expect(collect.winAmount).toBe(100000);
    });
});

// ============================================================
// 9. Multiplier Reel (乘倍行)
// ============================================================
describe('Multiplier Reel 乘倍行', () => {
    it('最後一行有 x3 時應將所有獎金乘以 3', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            WILD: [0, 0, 10, 40, 100],
        };
        const lines = { 1: [1, 1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 3,
            cols: 6,  // 5 主行 + 1 乘倍行
            hasMultiplierReel: true,
        });
        const grid = [
            ['A', 'A', 'A', 'A', 'A', 'x3'],
            ['B', 'B', 'B', 'B', 'B', ''],
            ['B', 'B', 'B', 'B', 'B', ''],
        ];
        const { results } = computeGridResults(t, grid, 100);
        // A x5 on line 1 = 50 * 100 = 5000, then * 3 = 15000
        expect(results.totalWin).toBe(15000);
    });

    it('乘倍行無乘倍時不影響結算', () => {
        const paytable = { A: [0, 0, 5, 20, 50] };
        const lines = { 1: [1, 1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 3,
            cols: 6,
            hasMultiplierReel: true,
        });
        const grid = [
            ['A', 'A', 'A', 'A', 'A', ''],
            ['B', 'B', 'B', 'B', 'B', ''],
            ['B', 'B', 'B', 'B', 'B', ''],
        ];
        const { results } = computeGridResults(t, grid, 100);
        expect(results.totalWin).toBe(5000); // 50 * 100, no multiplier
    });
});

// ============================================================
// 10. Dynamic Multiplier (xN 動態乘倍符號)
// ============================================================
describe('Dynamic Multiplier (xN)', () => {
    it('線獎中包含 xN 符號時應乘以該倍率 (product 模式)', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            WILD: [0, 0, 10, 40, 100],
        };
        const lines = { 1: [1, 1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 1,
            hasDynamicMultiplier: true,
            multiplierCalcType: 'product',
        });
        // x5 is a WILD with multiplier 5
        const grid = [['A', 'x5', 'A', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // A, x5(=WILD+5x), A = A x3 = 5*100 = 500, * 5 = 2500
        expect(line1.symbol).toBe('A');
        expect(line1.winAmount).toBe(2500);
    });

    it('多個 xN 符號應連乘 (product 模式)', () => {
        const paytable = {
            A: [0, 0, 0, 5],
            WILD: [0, 0, 0, 10],
        };
        const lines = { 1: [1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 1,
            cols: 4,
            hasDynamicMultiplier: true,
            multiplierCalcType: 'product',
        });
        const grid = [['A', 'x2', 'x3', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // A x4 = 5*100 = 500, * 2 * 3 = 3000
        expect(line1.winAmount).toBe(3000);
    });

    it('sum 模式下多個乘倍應相加', () => {
        const paytable = {
            A: [0, 0, 0, 5],
            WILD: [0, 0, 0, 10],
        };
        const lines = { 1: [1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 1,
            cols: 4,
            hasDynamicMultiplier: true,
            multiplierCalcType: 'sum',
        });
        const grid = [['A', 'x2', 'x3', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        // A x4 = 5*100 = 500, sum multiplier = 2+3=5, final = 500*5 = 2500
        expect(line1.winAmount).toBe(2500);
    });
});

// ============================================================
// 11. Double Symbol
// ============================================================
describe('Double Symbol', () => {
    it('A_double 應計為 2 個符號', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
        };
        const lines = { 1: [1, 1, 1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, {
            rows: 1,
            hasDoubleSymbol: true,
        });
        // A_double, A, A → count = 2+1+1 = 4, then B breaks
        const grid = [['A_double', 'A', 'A', 'B', 'B']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.symbol).toBe('A');
        expect(line1.count).toBe(4); // double(2) + 1 + 1
        expect(line1.winAmount).toBe(20 * 100); // 4連 = 20
    });

    it('All Ways 下 Double Symbol 也應正確計數', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
        };
        const t = makeAllWaysTemplate(paytable, { rows: 1, cols: 3, hasDoubleSymbol: true });
        const grid = [['A_double', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        expect(aResult).toBeTruthy();
        // totalUnits = 2+1+1 = 4 → payIndex = min(3, arr.length-1) = 3 → 20
        // ways = 1*1*1 = 1
        expect(aResult.winAmount).toBe(20 * 100);
    });
});

// ============================================================
// 12. 結果排序與結構
// ============================================================
describe('結果排序與結構', () => {
    it('SCATTER/COLLECT 結果應排在一般線獎之前', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            SCATTER: [0, 0, 20],
        };
        const lines = { 1: [2, 2, 2, 2, 2] };
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['SCATTER', 'B', 'SCATTER', 'B', 'SCATTER'],
            ['A',       'A', 'A',       'A', 'A'],
            ['B',       'B', 'B',       'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        expect(results.details.length).toBeGreaterThanOrEqual(2);
        // SCATTER 應在前面
        const firstResult = results.details[0];
        expect(String(firstResult.lineId).startsWith('SCATTER')).toBe(true);
    });

    it('結果物件應包含必要欄位', () => {
        const paytable = { A: [0, 0, 5] };
        const lines = { 1: [1, 1, 1] };
        const t = makePaylineTemplate(paytable, lines, { rows: 1 });
        const grid = [['A', 'A', 'A']];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1).toHaveProperty('lineId');
        expect(line1).toHaveProperty('symbol');
        expect(line1).toHaveProperty('count');
        expect(line1).toHaveProperty('payoutMult');
        expect(line1).toHaveProperty('winAmount');
        expect(line1).toHaveProperty('symbolsOnLine');
        expect(line1).toHaveProperty('positions');
        expect(line1).toHaveProperty('winCoords');
    });

    it('totalWin 應等於所有 details 的 winAmount 總和', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            SCATTER: [0, 0, 20],
        };
        const lines = {
            1: [2, 2, 2, 2, 2],
            2: [1, 1, 1, 1, 1],
        };
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['A',       'A', 'A',  'SCATTER', 'SCATTER'],
            ['A',       'A', 'A',  'A',       'A'],
            ['SCATTER', 'B', 'B',  'B',       'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const sumOfDetails = results.details
            .filter(d => d.winAmount > 0)
            .reduce((sum, d) => sum + d.winAmount, 0);
        expect(results.totalWin).toBeCloseTo(sumOfDetails, 4);
    });
});

// ============================================================
// 13. winCoords 座標驗證
// ============================================================
describe('winCoords 座標正確性', () => {
    it('固定線獎中獎座標應正確對應盤面位置', () => {
        const paytable = { A: [0, 0, 5, 20, 50] };
        const lines = { 1: [2, 2, 2, 2, 2] }; // 中間行 (row index 1)
        const t = makePaylineTemplate(paytable, lines);
        const grid = [
            ['B', 'B', 'B', 'B', 'B'],
            ['A', 'A', 'A', 'B', 'B'],
            ['B', 'B', 'B', 'B', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.winCoords).toHaveLength(3);
        expect(line1.winCoords[0]).toEqual({ row: 1, col: 0 });
        expect(line1.winCoords[1]).toEqual({ row: 1, col: 1 });
        expect(line1.winCoords[2]).toEqual({ row: 1, col: 2 });
    });

    it('All Ways 中獎座標應包含所有參與的格子', () => {
        const paytable = { A: [0, 0, 5] };
        const t = makeAllWaysTemplate(paytable, { rows: 2, cols: 3 });
        const grid = [
            ['A', 'A', 'A'],
            ['B', 'A', 'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);
        const aResult = results.details.find(r => r.symbol === 'A');
        // col0: A at (0,0) → 1 match
        // col1: A at (0,1) and (1,1) → 2 matches
        // col2: A at (0,2) → 1 match
        // All 4 coordinates should be in winCoords
        expect(aResult.winCoords).toContainEqual({ row: 0, col: 0 });
        expect(aResult.winCoords).toContainEqual({ row: 0, col: 1 });
        expect(aResult.winCoords).toContainEqual({ row: 1, col: 1 });
        expect(aResult.winCoords).toContainEqual({ row: 0, col: 2 });
    });
});

// ============================================================
// 14. 複合情境 (Real-world-like)
// ============================================================
describe('複合情境測試', () => {
    it('同時有線獎 + SCATTER + CASH/COLLECT 應全部正確累加', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            SCATTER: [0, 0, 20],
        };
        const lines = { 1: [2, 2, 2, 2, 2] };
        const t = makePaylineTemplate(paytable, lines, {
            requiresCollectToWin: true,
        });
        const grid = [
            ['SCATTER',  'SCATTER', 'SCATTER', 'CASH_100', 'CASH_200'],
            ['A',        'A',       'A',       'A',        'A'],
            ['COLLECT',  'B',       'B',       'B',        'B'],
        ];
        const { results } = computeGridResults(t, grid, 100);

        // Line 1: A x5 = 50*100 = 5000
        const line1 = results.details.find(r => r.lineId === 1);
        expect(line1.winAmount).toBe(5000);

        // SCATTER x3 = 20*100 = 2000
        const scatter = results.details.find(r => String(r.lineId).startsWith('SCATTER'));
        expect(scatter.winAmount).toBe(2000);

        // CASH: 100+200=300, COLLECT x1 → 300
        const collect = results.details.find(r => r.lineId === 'COLLECT_FEATURE');
        expect(collect.winAmount).toBe(300);

        // Total = 5000 + 2000 + 300 = 7300
        expect(results.totalWin).toBe(7300);
    });

    it('All Ways + Multiplier Reel 應先算 ways 再乘全域乘倍', () => {
        const paytable = {
            A: [0, 0, 5, 20, 50],
            WILD: [0, 0, 10, 40, 100],
        };
        const t = makeAllWaysTemplate(paytable, {
            rows: 3,
            cols: 4, // 3 main + 1 multiplier
            hasMultiplierReel: true,
        });
        const grid = [
            ['A', 'A', 'A', 'x5'],
            ['A', 'A', 'A', ''],
            ['A', 'A', 'A', ''],
        ];
        const { results } = computeGridResults(t, grid, 100);
        // 主盤面 3x3 全 A: ways = 3^3 = 27, A 3連 = 5*100*27 = 13500
        // x5 乘倍 → 13500 * 5 = 67500
        expect(results.totalWin).toBe(67500);
    });
});
