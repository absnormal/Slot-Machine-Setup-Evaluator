import { describe, it, expect } from 'vitest';
import { pickVisionModel, FALLBACK_MODELS } from '../src/utils/geminiApi';

describe('pickVisionModel 模型自動挑選', () => {
    it('使用者指定且清單有 → 用指定的', () => {
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
        expect(pickVisionModel(models, 'gemini-2.0-flash')).toBe('gemini-2.0-flash');
    });

    it('使用者指定但清單沒有 → 忽略，走自動', () => {
        const models = ['gemini-2.5-flash', 'gemini-flash-latest'];
        expect(pickVisionModel(models, 'gemini-1.0-pro')).toBe('gemini-flash-latest');
    });

    it('優先 gemini-flash-latest 別名', () => {
        const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
        expect(pickVisionModel(models, '')).toBe('gemini-flash-latest');
    });

    it('無別名時挑最新的 flash 穩定版', () => {
        const models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
        expect(pickVisionModel(models, '')).toBe('gemini-2.5-flash');
    });

    it('排除 exp/preview/thinking 實驗版', () => {
        const models = ['gemini-2.5-flash-exp', 'gemini-2.0-flash', 'gemini-3.0-flash-preview'];
        expect(pickVisionModel(models, '')).toBe('gemini-2.0-flash');
    });

    it('沒有 flash → 退回清單第一個', () => {
        const models = ['gemini-2.5-pro', 'gemini-1.5-pro'];
        expect(pickVisionModel(models, '')).toBe('gemini-2.5-pro');
    });

    it('空清單 → null', () => {
        expect(pickVisionModel([], '')).toBe(null);
        expect(pickVisionModel(null, '')).toBe(null);
    });

    it('內建候選以 -latest 別名為首', () => {
        expect(FALLBACK_MODELS[0]).toBe('gemini-flash-latest');
    });
});
