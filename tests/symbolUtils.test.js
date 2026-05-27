import { describe, it, expect } from 'vitest';
import {
    isScatterSymbol,
    isCollectSymbol,
    isWildSymbol,
    isDynamicMultiplierSymbol,
    isJpSymbol,
    isDoubleSymbol,
    getSymbolCount,
    getSymbolMultiplier,
    isMultiplierSymbol,
    isCashSymbol,
    formatShorthandValue,
    parseShorthandValue,
    getCashValue,
    getCollectValue,
    getBaseSymbol,
    getSymbolDisplayImage,
} from '../src/utils/symbolUtils';

// ============================================================
// 1. isScatterSymbol
// ============================================================
describe('isScatterSymbol', () => {
    it('null 或 undefined 應回傳 falsy', () => {
        expect(isScatterSymbol(null)).toBeFalsy();
        expect(isScatterSymbol(undefined)).toBeFalsy();
    });

    it('空字串應回傳 falsy', () => {
        expect(isScatterSymbol('')).toBeFalsy();
    });

    it('"SCATTER" 應回傳 truthy', () => {
        expect(isScatterSymbol('SCATTER')).toBeTruthy();
    });

    it('帶前綴/後綴的 SCATTER 應回傳 truthy (如 SCATTER_錢幣)', () => {
        expect(isScatterSymbol('SCATTER_錢幣')).toBeTruthy();
        expect(isScatterSymbol('SCATTER_500')).toBeTruthy();
        expect(isScatterSymbol('金SCATTER')).toBeTruthy();
    });

    it('小寫 scatter 也應回傳 truthy (大小寫無關)', () => {
        expect(isScatterSymbol('scatter')).toBeTruthy();
        expect(isScatterSymbol('Scatter')).toBeTruthy();
    });

    it('不含 SCATTER 的字串應回傳 falsy', () => {
        expect(isScatterSymbol('A')).toBeFalsy();
        expect(isScatterSymbol('WILD')).toBeFalsy();
        expect(isScatterSymbol('CASH_500')).toBeFalsy();
    });
});

// ============================================================
// 2. isCollectSymbol
// ============================================================
describe('isCollectSymbol', () => {
    it('null 或 undefined 應回傳 falsy', () => {
        expect(isCollectSymbol(null)).toBeFalsy();
        expect(isCollectSymbol(undefined)).toBeFalsy();
    });

    it('"COLLECT" 應回傳 truthy', () => {
        expect(isCollectSymbol('COLLECT')).toBeTruthy();
    });

    it('包含 COLLECT 的複合符號應回傳 truthy', () => {
        expect(isCollectSymbol('WILD_COLLECT')).toBeTruthy();
        expect(isCollectSymbol('collect_x2')).toBeTruthy();
        expect(isCollectSymbol('COLLECT_500')).toBeTruthy();
    });

    it('不含 COLLECT 的字串應回傳 falsy', () => {
        expect(isCollectSymbol('A')).toBeFalsy();
        expect(isCollectSymbol('CASH_500')).toBeFalsy();
    });
});

// ============================================================
// 3. isWildSymbol
// ============================================================
describe('isWildSymbol', () => {
    it('null 或 undefined 應回傳 false', () => {
        expect(isWildSymbol(null)).toBe(false);
        expect(isWildSymbol(undefined)).toBe(false);
    });

    it('非字串應回傳 false', () => {
        expect(isWildSymbol(123)).toBe(false);
    });

    it('"WILD" 應回傳 true', () => {
        expect(isWildSymbol('WILD')).toBe(true);
    });

    it('帶後綴的 WILD 應回傳 true (如 WILD_元寶)', () => {
        expect(isWildSymbol('WILD_元寶')).toBe(true);
        expect(isWildSymbol('WILD_x3')).toBe(true);
    });

    it('獨立乘倍符號 x5, x2, xN 應被視為 WILD', () => {
        expect(isWildSymbol('x5')).toBe(true);
        expect(isWildSymbol('x2')).toBe(true);
        expect(isWildSymbol('xN')).toBe(true);
        expect(isWildSymbol('X10')).toBe(true);
        expect(isWildSymbol('x2.5')).toBe(true);
    });

    it('普通符號 A 不應是 WILD', () => {
        expect(isWildSymbol('A')).toBe(false);
        expect(isWildSymbol('SCATTER')).toBe(false);
    });

    it('帶前綴的乘倍符號 A_x3 不應被視為 standalone WILD', () => {
        // A_x3 contains neither 'WILD' nor matches ^x(\d+)$
        expect(isWildSymbol('A_x3')).toBe(false);
    });
});

// ============================================================
// 4. isDynamicMultiplierSymbol
// ============================================================
describe('isDynamicMultiplierSymbol', () => {
    it('null 或 undefined 應回傳 false', () => {
        expect(isDynamicMultiplierSymbol(null)).toBe(false);
        expect(isDynamicMultiplierSymbol(undefined)).toBe(false);
    });

    it('非字串應回傳 false', () => {
        expect(isDynamicMultiplierSymbol(123)).toBe(false);
    });

    it('獨立乘倍符號 x5, xN 應回傳 true', () => {
        expect(isDynamicMultiplierSymbol('x5')).toBe(true);
        expect(isDynamicMultiplierSymbol('xN')).toBe(true);
        expect(isDynamicMultiplierSymbol('x2.5')).toBe(true);
    });

    it('帶前綴的乘倍符號 A_x3 應回傳 true', () => {
        expect(isDynamicMultiplierSymbol('A_x3')).toBe(true);
        expect(isDynamicMultiplierSymbol('Grape_x5')).toBe(true);
        expect(isDynamicMultiplierSymbol('H1_xN')).toBe(true);
    });

    it('普通符號不含 _xN 的不應回傳 true', () => {
        expect(isDynamicMultiplierSymbol('A')).toBe(false);
        expect(isDynamicMultiplierSymbol('WILD')).toBe(false);
        expect(isDynamicMultiplierSymbol('SCATTER')).toBe(false);
    });

    it('中間含 x 但結尾不含的不應匹配', () => {
        expect(isDynamicMultiplierSymbol('x5_A')).toBe(false);
    });
});

// ============================================================
// 5. isJpSymbol
// ============================================================
describe('isJpSymbol', () => {
    const jpConfig = { GRAND: '1000', MINI: '10' };

    it('null 或 undefined 應回傳 falsy', () => {
        expect(isJpSymbol(null, jpConfig)).toBeFalsy();
        expect(isJpSymbol(undefined, jpConfig)).toBeFalsy();
    });

    it('非字串應回傳 falsy', () => {
        expect(isJpSymbol(123, jpConfig)).toBeFalsy();
    });

    it('JP 符號在 jpConfig 中應回傳 truthy', () => {
        expect(isJpSymbol('GRAND', jpConfig)).toBeTruthy();
        expect(isJpSymbol('MINI', jpConfig)).toBeTruthy();
    });

    it('JP 符號大小寫無關 (轉 uppercase 匹配)', () => {
        expect(isJpSymbol('grand', jpConfig)).toBeTruthy();
        expect(isJpSymbol('Grand', jpConfig)).toBeTruthy();
    });

    it('不在 jpConfig 中的符號應回傳 falsy', () => {
        expect(isJpSymbol('MAJOR', jpConfig)).toBeFalsy();
        expect(isJpSymbol('A', jpConfig)).toBeFalsy();
    });

    it('空 jpConfig 時所有符號都不是 JP', () => {
        expect(isJpSymbol('GRAND', {})).toBeFalsy();
        expect(isJpSymbol('GRAND')).toBeFalsy();
    });

    it('jpConfig 為 null 時不應報錯', () => {
        expect(isJpSymbol('GRAND', null)).toBeFalsy();
    });
});

// ============================================================
// 6. isDoubleSymbol
// ============================================================
describe('isDoubleSymbol', () => {
    it('null 或 undefined 應回傳 falsy', () => {
        expect(isDoubleSymbol(null)).toBeFalsy();
        expect(isDoubleSymbol(undefined)).toBeFalsy();
    });

    it('非字串應回傳 falsy', () => {
        expect(isDoubleSymbol(123)).toBeFalsy();
    });

    it('"A_double" 應回傳 truthy', () => {
        expect(isDoubleSymbol('A_double')).toBeTruthy();
    });

    it('"A_DOUBLE" (大寫) 也應回傳 truthy', () => {
        expect(isDoubleSymbol('A_DOUBLE')).toBeTruthy();
    });

    it('"double" 本身不應匹配 (沒有 _ 前綴)', () => {
        // 'double'.toLowerCase().endsWith('_double') is false — 'double' does not end with '_double'
        expect(isDoubleSymbol('double')).toBeFalsy();
    });

    it('普通符號不應被識別為 double', () => {
        expect(isDoubleSymbol('A')).toBeFalsy();
        expect(isDoubleSymbol('WILD')).toBeFalsy();
    });
});

// ============================================================
// 7. getSymbolCount
// ============================================================
describe('getSymbolCount', () => {
    it('普通符號回傳 1', () => {
        expect(getSymbolCount('A')).toBe(1);
        expect(getSymbolCount('WILD')).toBe(1);
    });

    it('_double 符號回傳 2', () => {
        expect(getSymbolCount('A_double')).toBe(2);
        expect(getSymbolCount('WILD_DOUBLE')).toBe(2);
    });

    it('null 應回傳 1 (非 double)', () => {
        expect(getSymbolCount(null)).toBe(1);
    });
});

// ============================================================
// 8. getSymbolMultiplier
// ============================================================
describe('getSymbolMultiplier', () => {
    it('null 或 undefined 應回傳 1', () => {
        expect(getSymbolMultiplier(null)).toBe(1);
        expect(getSymbolMultiplier(undefined)).toBe(1);
    });

    it('非字串應回傳 1', () => {
        expect(getSymbolMultiplier(123)).toBe(1);
    });

    it('獨立乘倍符號 x5 應回傳 5', () => {
        expect(getSymbolMultiplier('x5')).toBe(5);
    });

    it('帶後綴乘倍符號 A_x3 應回傳 3', () => {
        expect(getSymbolMultiplier('A_x3')).toBe(3);
    });

    it('小數乘倍 x2.5 應回傳 2.5', () => {
        expect(getSymbolMultiplier('x2.5')).toBe(2.5);
        expect(getSymbolMultiplier('A_x1.5')).toBe(1.5);
    });

    it('普通符號 A 應回傳 1', () => {
        expect(getSymbolMultiplier('A')).toBe(1);
        expect(getSymbolMultiplier('WILD')).toBe(1);
    });
});

// ============================================================
// 8b. isMultiplierSymbol
// ============================================================
describe('isMultiplierSymbol', () => {
    it('乘倍符號 x5 應回傳 true', () => {
        expect(isMultiplierSymbol('x5')).toBe(true);
    });

    it('普通符號 A 應回傳 false', () => {
        expect(isMultiplierSymbol('A')).toBe(false);
    });

    it('null 應回傳 false (multiplier=1, not > 1)', () => {
        expect(isMultiplierSymbol(null)).toBe(false);
    });
});

// ============================================================
// 9. isCashSymbol
// ============================================================
describe('isCashSymbol', () => {
    it('null 或 undefined 應回傳 false', () => {
        expect(isCashSymbol(null)).toBe(false);
        expect(isCashSymbol(undefined)).toBe(false);
    });

    it('CASH 開頭的符號應回傳 true', () => {
        expect(isCashSymbol('CASH_500')).toBe(true);
        expect(isCashSymbol('CASH')).toBe(true);
        expect(isCashSymbol('cash_100')).toBe(true);
    });

    it('JP 符號在有 jpConfig 時也是 Cash', () => {
        expect(isCashSymbol('GRAND', { GRAND: '1000' })).toBe(true);
    });

    it('非 CASH/JP 符號應回傳 false', () => {
        expect(isCashSymbol('A')).toBe(false);
        expect(isCashSymbol('WILD')).toBe(false);
        expect(isCashSymbol('SCATTER')).toBe(false);
    });
});

// ============================================================
// 10. formatShorthandValue
// ============================================================
describe('formatShorthandValue', () => {
    it('0 應回傳空字串', () => {
        expect(formatShorthandValue(0)).toBe('');
    });

    it('null / undefined / NaN 應回傳空字串', () => {
        expect(formatShorthandValue(null)).toBe('');
        expect(formatShorthandValue(undefined)).toBe('');
        expect(formatShorthandValue(NaN)).toBe('');
    });

    it('500 應原樣回傳 "500"', () => {
        expect(formatShorthandValue(500)).toBe('500');
    });

    it('1500 應回傳 "1.5K"', () => {
        expect(formatShorthandValue(1500)).toBe('1.5K');
    });

    it('2000 應回傳 "2K"', () => {
        expect(formatShorthandValue(2000)).toBe('2K');
    });

    it('2000000 應回傳 "2M"', () => {
        expect(formatShorthandValue(2000000)).toBe('2M');
    });

    it('3000000000 應回傳 "3B"', () => {
        expect(formatShorthandValue(3000000000)).toBe('3B');
    });

    it('負數也應正確處理', () => {
        expect(formatShorthandValue(-1500)).toBe('-1.5K');
        expect(formatShorthandValue(-2000000)).toBe('-2M');
    });

    it('邊界值 999 應原樣回傳', () => {
        expect(formatShorthandValue(999)).toBe('999');
    });

    it('邊界值 1000 應回傳 "1K"', () => {
        expect(formatShorthandValue(1000)).toBe('1K');
    });
});

// ============================================================
// 11. parseShorthandValue
// ============================================================
describe('parseShorthandValue', () => {
    it('null 或 undefined 應回傳 0', () => {
        expect(parseShorthandValue(null)).toBe(0);
        expect(parseShorthandValue(undefined)).toBe(0);
    });

    it('"1.5K" 應回傳 1500', () => {
        expect(parseShorthandValue('1.5K')).toBe(1500);
    });

    it('"2M" 應回傳 2000000', () => {
        expect(parseShorthandValue('2M')).toBe(2000000);
    });

    it('"3B" 應回傳 3000000000', () => {
        expect(parseShorthandValue('3B')).toBe(3000000000);
    });

    it('"500" 純數字應回傳 500', () => {
        expect(parseShorthandValue('500')).toBe(500);
    });

    it('"abc" 非數字應回傳 0', () => {
        expect(parseShorthandValue('abc')).toBe(0);
    });

    it('空字串應回傳 0', () => {
        expect(parseShorthandValue('')).toBe(0);
    });

    it('小寫後綴也應正確解析', () => {
        expect(parseShorthandValue('1.5k')).toBe(1500);
        expect(parseShorthandValue('2m')).toBe(2000000);
    });

    it('含前後空白應正確處理', () => {
        expect(parseShorthandValue('  1.5K  ')).toBe(1500);
    });

    it('數字型態輸入也應嘗試解析', () => {
        expect(parseShorthandValue(500)).toBe(500);
    });
});

// ============================================================
// 12. getCashValue
// ============================================================
describe('getCashValue', () => {
    it('null 應回傳 0', () => {
        expect(getCashValue(null)).toBe(0);
    });

    it('"CASH_500" 應回傳 500', () => {
        expect(getCashValue('CASH_500')).toBe(500);
    });

    it('"CASH_1.5K" 應回傳 1500', () => {
        expect(getCashValue('CASH_1.5K')).toBe(1500);
    });

    it('JP 符號應依 jpConfig 值回傳', () => {
        const jpConfig = { GRAND: '1000', MINI: '10' };
        expect(getCashValue('GRAND', jpConfig)).toBe(1000);
        expect(getCashValue('MINI', jpConfig)).toBe(10);
    });

    it('JP 符號值為非數字應回傳 0', () => {
        expect(getCashValue('GRAND', { GRAND: 'abc' })).toBe(0);
    });

    it('非 CASH 符號應回傳 0', () => {
        expect(getCashValue('A')).toBe(0);
        expect(getCashValue('WILD')).toBe(0);
    });

    it('"CASH" 不帶值部分時應回傳 0 (parseShorthandValue("CASH") → 0)', () => {
        expect(getCashValue('CASH')).toBe(0);
    });
});

// ============================================================
// 13. getCollectValue
// ============================================================
describe('getCollectValue', () => {
    it('非 COLLECT 符號應回傳 0', () => {
        expect(getCollectValue('A')).toBe(0);
        expect(getCollectValue(null)).toBe(0);
    });

    it('"COLLECT" 無數值部分應回傳 0 (parseShorthandValue("COLLECT") → 0)', () => {
        expect(getCollectValue('COLLECT')).toBe(0);
    });

    it('"COLLECT_500" 應回傳 500', () => {
        expect(getCollectValue('COLLECT_500')).toBe(500);
    });

    it('"COLLECT_1.5K" 應回傳 1500', () => {
        expect(getCollectValue('COLLECT_1.5K')).toBe(1500);
    });

    it('"COLLECT_x2" 的最後部分 "x2" 解析 → parseShorthandValue("x2")', () => {
        // parseShorthandValue('x2') → parseFloat('X2') = NaN → 0
        expect(getCollectValue('COLLECT_x2')).toBe(0);
    });
});

// ============================================================
// 14. getBaseSymbol
// ============================================================
describe('getBaseSymbol', () => {
    it('null 或 undefined 應原樣回傳', () => {
        expect(getBaseSymbol(null)).toBe(null);
        expect(getBaseSymbol(undefined)).toBe(undefined);
    });

    it('非字串應原樣回傳', () => {
        expect(getBaseSymbol(123)).toBe(123);
    });

    it('"A" 普通符號原樣回傳', () => {
        expect(getBaseSymbol('A')).toBe('A');
    });

    it('"x5" standalone 乘倍符號應回傳 "xN"', () => {
        expect(getBaseSymbol('x5')).toBe('xN');
        expect(getBaseSymbol('x2')).toBe('xN');
        expect(getBaseSymbol('x10')).toBe('xN');
        expect(getBaseSymbol('x2.5')).toBe('xN');
    });

    it('"A_double" 應回傳 "A" (移除 _double)', () => {
        expect(getBaseSymbol('A_double')).toBe('A');
    });

    it('"Grape_x5" 應回傳 "Grape" (移除 _x5)', () => {
        expect(getBaseSymbol('Grape_x5')).toBe('Grape');
    });

    it('"H1_xN" 應回傳 "H1" (移除 _xN)', () => {
        expect(getBaseSymbol('H1_xN')).toBe('H1');
    });

    it('"CASH_500" 應回傳 "CASH" (移除數值部分)', () => {
        expect(getBaseSymbol('CASH_500')).toBe('CASH');
    });

    it('"CASH_1.5K" 應回傳 "CASH"', () => {
        expect(getBaseSymbol('CASH_1.5K')).toBe('CASH');
    });

    it('"COLLECT_500" 應回傳 "COLLECT"', () => {
        expect(getBaseSymbol('COLLECT_500')).toBe('COLLECT');
    });

    it('JP 符號應轉大寫回傳', () => {
        const jpConfig = { GRAND: '1000' };
        expect(getBaseSymbol('grand', jpConfig)).toBe('GRAND');
        expect(getBaseSymbol('GRAND', jpConfig)).toBe('GRAND');
    });

    it('"A_x3_double" 應移除 _double 和 _x3 得到 "A"', () => {
        expect(getBaseSymbol('A_x3_double')).toBe('A');
    });

    it('"WILD" 普通 WILD 原樣回傳', () => {
        expect(getBaseSymbol('WILD')).toBe('WILD');
    });
});

// ============================================================
// 15. getSymbolDisplayImage
// ============================================================
describe('getSymbolDisplayImage', () => {
    it('sym 為 null 應回傳 null', () => {
        expect(getSymbolDisplayImage(null, { A: 'a.png' })).toBe(null);
    });

    it('symbolImages 為 null 應回傳 null', () => {
        expect(getSymbolDisplayImage('A', null)).toBe(null);
    });

    it('完整名稱直接匹配', () => {
        const images = { A: 'a.png', B: 'b.png' };
        expect(getSymbolDisplayImage('A', images)).toBe('a.png');
    });

    it('base 符號匹配 (如 A_double → 找 A 圖片)', () => {
        const images = { A: 'a.png' };
        expect(getSymbolDisplayImage('A_double', images)).toBe('a.png');
    });

    it('base 符號匹配 (如 CASH_500 → 找 CASH 圖片)', () => {
        const images = { CASH: 'cash.png' };
        expect(getSymbolDisplayImage('CASH_500', images)).toBe('cash.png');
    });

    it('模糊匹配：COLLECT_500 → 找包含 COLLECT 的 key (如 漁夫COLLECT)', () => {
        const images = { '漁夫COLLECT': 'collect.png' };
        expect(getSymbolDisplayImage('COLLECT_500', images)).toBe('collect.png');
    });

    it('類別匹配：找同類型符號 (COLLECT → COLLECT 類別)', () => {
        // COLLECT_500 的 base 是 COLLECT，但 images 中沒有包含 COLLECT 的 key
        // 但有另一個 collect 類別的 key
        const images = { 'MY_COLLECT_ICON': 'icon.png' };
        expect(getSymbolDisplayImage('COLLECT_500', images)).toBe('icon.png');
    });

    it('SCATTER 類別匹配', () => {
        const images = { 'SCATTER_FREE': 'scatter.png' };
        expect(getSymbolDisplayImage('SCATTER_錢幣', images)).toBe('scatter.png');
    });

    it('WILD 類別匹配', () => {
        const images = { 'WILD_元寶': 'wild.png' };
        expect(getSymbolDisplayImage('WILD_龍', images)).toBe('wild.png');
    });

    it('找不到任何匹配時應回傳 null', () => {
        const images = { B: 'b.png', C: 'c.png' };
        expect(getSymbolDisplayImage('A', images)).toBe(null);
    });

    it('JP 符號應能透過 jpConfig 匹配 CASH 類別', () => {
        const jpConfig = { GRAND: '1000' };
        const images = { CASH: 'cash.png' };
        // GRAND is JP → isCash → base is GRAND → no direct match
        // partial match: does 'CASH' include 'GRAND'? no
        // category match: isCash('CASH', jpConfig)? yes (starts with CASH)
        expect(getSymbolDisplayImage('GRAND', images, jpConfig)).toBe('cash.png');
    });

    it('standalone 乘倍符號 x5 應通過 WILD 類別匹配', () => {
        const images = { WILD: 'wild.png' };
        // x5 的 base 是 xN，images 中沒有 xN
        // isWild('x5') = true → partialMatch: 'WILD'.includes('XN')? no
        // categoryMatch: isWild('WILD')? yes
        expect(getSymbolDisplayImage('x5', images)).toBe('wild.png');
    });
});
