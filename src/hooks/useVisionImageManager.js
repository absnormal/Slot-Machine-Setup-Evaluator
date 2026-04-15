import { useState, useCallback, useEffect } from 'react';

export function useVisionImageManager(isPhase3Minimized) {
    const [visionImages, setVisionImages] = useState([]);
    const [activeVisionId, setActiveVisionId] = useState(null);

    const activeVisionImg = visionImages.find(img => img.id === activeVisionId) || null;
    const visionImageObj = activeVisionImg?.obj || null;
    const visionImageSrc = activeVisionImg?.previewUrl || null;
    const visionGrid = activeVisionImg?.grid || null;
    const visionError = activeVisionImg?.error || null;

    const handleVisionImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        let loadedCount = 0;
        const newImgs = [];

        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    newImgs.push({
                        id: Math.random().toString(36).substring(7),
                        file,
                        previewUrl: evt.target.result,
                        obj: img,
                        grid: null,
                        error: ''
                    });
                    loadedCount++;
                    if (loadedCount === files.length) {
                        setVisionImages(prev => {
                            const updated = [...prev, ...newImgs];
                            if (!activeVisionId && updated.length > 0) {
                                setActiveVisionId(updated[0].id);
                            }
                            return updated;
                        });
                    }
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeVisionImage = (id) => {
        setVisionImages(prev => {
            if (id === 'ALL') {
                setActiveVisionId(null);
                return [];
            }
            const filtered = prev.filter(img => img.id !== id);
            if (activeVisionId === id) {
                setActiveVisionId(filtered.length > 0 ? filtered[0].id : null);
            }
            return filtered;
        });
    };

    const resetVisionImage = useCallback((id) => {
        setVisionImages(prev => prev.map(img => {
            if (id === 'ALL' || img.id === id) {
                return { ...img, grid: null, error: '', bet: undefined };
            }
            return img;
        }));
    }, []);

    const goToPrevVisionImage = useCallback(() => {
        if (!activeVisionId || visionImages.length === 0) return;
        const curIdx = visionImages.findIndex(img => img.id === activeVisionId);
        if (curIdx > 0) {
            setActiveVisionId(visionImages[curIdx - 1].id);
        }
    }, [activeVisionId, visionImages]);

    const goToNextVisionImage = useCallback(() => {
        if (!activeVisionId || visionImages.length === 0) return;
        const curIdx = visionImages.findIndex(img => img.id === activeVisionId);
        if (curIdx >= 0 && curIdx < visionImages.length - 1) {
            setActiveVisionId(visionImages[curIdx + 1].id);
        }
    }, [activeVisionId, visionImages]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
            if (isPhase3Minimized) return;

            if (e.key === 'ArrowLeft') {
                goToPrevVisionImage();
            } else if (e.key === 'ArrowRight') {
                goToNextVisionImage();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToPrevVisionImage, goToNextVisionImage, isPhase3Minimized]);

    return {
        visionImages,
        setVisionImages,
        activeVisionId,
        setActiveVisionId,
        activeVisionImg,
        visionImageObj,
        visionImageSrc,
        visionGrid,
        visionError,
        handleVisionImageUpload,
        removeVisionImage,
        resetVisionImage,
        goToPrevVisionImage,
        goToNextVisionImage
    };
}
