// === 共用輔助函式 ===
export const toPx = (val, max) => (val / 100) * max;
export const toPct = (val, max) => (val / max) * 100;

export const fetchWithRetry = async (url, options, maxRetries = 5) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            await new Promise(resolve => setTimeout(resolve, delays[i]));
        }
    }
};

export const ptFileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

/**
 * Resize a base64 image so its longest side is at most maxDim pixels.
 * Returns a promise that resolves with { base64, mimeType }.
 */
export const resizeImageBase64 = (base64, maxDim = 512, quality = 0.5, outputMime = 'image/jpeg') => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL(outputMime, quality);
        resolve({ base64: dataUrl.split(',')[1], mimeType: outputMime });
    };
    img.onerror = reject;
    // Handle both raw base64 and data URL formats
    img.src = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
});
