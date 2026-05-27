import { describe, it, expect } from 'vitest';
import {
    getGridMask,
    isIrregularGrid,
    getReelOffset,
    getVisibleCellCount,
} from '../src/utils/gridShapeUtils';

// ============================================================
// 1. getGridMask
// ============================================================
describe('getGridMask', () => {
    it('標準方格盤面 (無 reelHeights) 應全部為 true', () => {
        const template = { rows: 3, cols: 5 };
        const mask = getGridMask(template);
        expect(mask).toHaveLength(3);
        expect(mask[0]).toHaveLength(5);
        mask.forEach(row => row.forEach(cell => expect(cell).toBe(true)));
    });

    it('reelHeights 全部等於 rows 時應全部為 true', () => {
        const template = { rows: 3, cols: 5, reelHeights: [3, 3, 3, 3, 3] };
        const mask = getGridMask(template);
        expect(mask).toHaveLength(3);
        mask.forEach(row => row.forEach(cell => expect(cell).toBe(true)));
    });

    it('reelHeights 全部大於 rows 時應全部為 true', () => {
        const template = { rows: 3, cols: 3, reelHeights: [5, 5, 5] };
        const mask = getGridMask(template);
        expect(mask).toHaveLength(3);
        mask.forEach(row => row.forEach(cell => expect(cell).toBe(true)));
    });

    it('不規則盤面應正確生成遮罩 (頂部對齊)', () => {
        // 3 rows x 5 cols, reelHeights = [3, 4, 5, 4, 3]
        // col 0: h=3 → rows 0,1,2 = true
        // col 1: h=3 (min(4,3)) → rows 0,1,2 = true
        // col 2: h=3 (min(5,3)) → rows 0,1,2 = true
        // 全部 h >= rows → 應全為 true
        const template = { rows: 3, cols: 5, reelHeights: [3, 4, 5, 4, 3] };
        const mask = getGridMask(template);
        mask.forEach(row => row.forEach(cell => expect(cell).toBe(true)));
    });

    it('部分轉軸較短時底部格子應為 false (頂部對齊)', () => {
        // 4 rows x 3 cols, reelHeights = [4, 2, 4]
        // col 0: h=4 → all true
        // col 1: h=2 → rows 0,1 true; rows 2,3 false
        // col 2: h=4 → all true
        const template = { rows: 4, cols: 3, reelHeights: [4, 2, 4] };
        const mask = getGridMask(template);
        expect(mask).toHaveLength(4);
        // row 0: [true, true, true]
        expect(mask[0]).toEqual([true, true, true]);
        // row 1: [true, true, true]
        expect(mask[1]).toEqual([true, true, true]);
        // row 2: [true, false, true]
        expect(mask[2]).toEqual([true, false, true]);
        // row 3: [true, false, true]
        expect(mask[3]).toEqual([true, false, true]);
    });

    it('鑽石形盤面 reelHeights = [1, 2, 3, 2, 1]', () => {
        const template = { rows: 3, cols: 5, reelHeights: [1, 2, 3, 2, 1] };
        const mask = getGridMask(template);
        // col 0: h=1 → row 0 true, rows 1,2 false
        expect(mask[0][0]).toBe(true);
        expect(mask[1][0]).toBe(false);
        expect(mask[2][0]).toBe(false);
        // col 1: h=2 → rows 0,1 true, row 2 false
        expect(mask[0][1]).toBe(true);
        expect(mask[1][1]).toBe(true);
        expect(mask[2][1]).toBe(false);
        // col 2: h=3 → all true
        expect(mask[0][2]).toBe(true);
        expect(mask[1][2]).toBe(true);
        expect(mask[2][2]).toBe(true);
        // col 3: h=2
        expect(mask[0][3]).toBe(true);
        expect(mask[1][3]).toBe(true);
        expect(mask[2][3]).toBe(false);
        // col 4: h=1
        expect(mask[0][4]).toBe(true);
        expect(mask[1][4]).toBe(false);
        expect(mask[2][4]).toBe(false);
    });

    it('rows 為 0 應回傳空陣列', () => {
        const mask = getGridMask({ rows: 0, cols: 5 });
        expect(mask).toEqual([]);
    });

    it('cols 為 0 應回傳空陣列', () => {
        const mask = getGridMask({ rows: 3, cols: 0 });
        expect(mask).toEqual([]);
    });

    it('reelHeights 為非陣列時應視為標準盤面', () => {
        const template = { rows: 2, cols: 2, reelHeights: 'invalid' };
        const mask = getGridMask(template);
        expect(mask).toHaveLength(2);
        mask.forEach(row => row.forEach(cell => expect(cell).toBe(true)));
    });
});

// ============================================================
// 2. isIrregularGrid
// ============================================================
describe('isIrregularGrid', () => {
    it('無 reelHeights 應回傳 false', () => {
        expect(isIrregularGrid({ rows: 3, cols: 5 })).toBe(false);
    });

    it('reelHeights 全部等於 rows 應回傳 false', () => {
        expect(isIrregularGrid({ rows: 3, cols: 5, reelHeights: [3, 3, 3, 3, 3] })).toBe(false);
    });

    it('reelHeights 中有不等於 rows 的應回傳 true', () => {
        expect(isIrregularGrid({ rows: 3, cols: 5, reelHeights: [3, 4, 5, 4, 3] })).toBe(true);
        expect(isIrregularGrid({ rows: 3, cols: 3, reelHeights: [3, 2, 3] })).toBe(true);
    });

    it('template 為 null 應回傳 false', () => {
        expect(isIrregularGrid(null)).toBe(false);
    });

    it('template 為 undefined 應回傳 false', () => {
        expect(isIrregularGrid(undefined)).toBe(false);
    });

    it('reelHeights 為非陣列應回傳 false', () => {
        expect(isIrregularGrid({ rows: 3, cols: 5, reelHeights: 'not_array' })).toBe(false);
    });
});

// ============================================================
// 3. getReelOffset
// ============================================================
describe('getReelOffset', () => {
    it('任何輸入都應回傳 0 (頂部對齊)', () => {
        expect(getReelOffset({ rows: 3, cols: 5 }, 0)).toBe(0);
        expect(getReelOffset({ rows: 3, cols: 5, reelHeights: [1, 2, 3, 2, 1] }, 0)).toBe(0);
        expect(getReelOffset({ rows: 3, cols: 5, reelHeights: [1, 2, 3, 2, 1] }, 2)).toBe(0);
        expect(getReelOffset({ rows: 3, cols: 5, reelHeights: [1, 2, 3, 2, 1] }, 4)).toBe(0);
    });

    it('null template 也回傳 0', () => {
        expect(getReelOffset(null, 0)).toBe(0);
    });

    it('不同 col 值都回傳 0', () => {
        const t = { rows: 5, cols: 5, reelHeights: [3, 4, 5, 4, 3] };
        for (let i = 0; i < 5; i++) {
            expect(getReelOffset(t, i)).toBe(0);
        }
    });
});

// ============================================================
// 4. getVisibleCellCount
// ============================================================
describe('getVisibleCellCount', () => {
    it('標準方格盤面應回傳 rows * cols', () => {
        expect(getVisibleCellCount({ rows: 3, cols: 5 })).toBe(15);
    });

    it('reelHeights 全等於 rows 應回傳 rows * cols', () => {
        expect(getVisibleCellCount({ rows: 3, cols: 5, reelHeights: [3, 3, 3, 3, 3] })).toBe(15);
    });

    it('不規則盤面應回傳各轉軸可見列數之和', () => {
        // reelHeights = [1, 2, 3, 2, 1], rows=3
        // sum = min(1,3)+min(2,3)+min(3,3)+min(2,3)+min(1,3) = 1+2+3+2+1 = 9
        expect(getVisibleCellCount({ rows: 3, cols: 5, reelHeights: [1, 2, 3, 2, 1] })).toBe(9);
    });

    it('reelHeights 大於 rows 時應被 clamp 到 rows', () => {
        // reelHeights = [5, 5, 5], rows=3
        // sum = 3+3+3 = 9
        expect(getVisibleCellCount({ rows: 3, cols: 3, reelHeights: [5, 5, 5] })).toBe(9);
    });

    it('null template 應回傳 0', () => {
        expect(getVisibleCellCount(null)).toBe(0);
    });

    it('無 rows/cols 時應回傳 0', () => {
        expect(getVisibleCellCount({})).toBe(0);
    });

    it('reelHeights 為非陣列時應 fallback 到 rows*cols', () => {
        expect(getVisibleCellCount({ rows: 3, cols: 5, reelHeights: 'invalid' })).toBe(15);
    });
});
