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
