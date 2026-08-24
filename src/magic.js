/**
 * Compresses an image to a target file size (KB) using a binary search over
 * JPEG/WebP quality, falling back to progressive downscaling if quality
 * search alone isn't enough. Never returns a result larger than the original.
 */
class MagicImageCompressor {
    /**
     * @param {object} [options]
     * @param {number} [options.targetSizeKB=50] - Desired output size in kilobytes.
     * @param {number} [options.maxWidth=4096] - Upper bound on output width.
     * @param {number} [options.maxHeight=4096] - Upper bound on output height.
     * @param {boolean} [options.maintainAspectRatio=true] - Currently informational; dimension math always preserves ratio.
     * @param {number} [options.minQuality=0.1] - Lower bound for the quality binary search.
     * @param {number} [options.maxQuality=0.92] - Upper bound for the quality binary search.
     * @param {number} [options.stepQuality=0.05] - Reserved for future step-based search; not used by the binary search.
     * @param {'auto'|string} [options.format='auto'] - 'auto' picks JPEG; otherwise pass a MIME type like 'image/webp'.
     */
    constructor(options = {}) {
        this.options = {
            targetSizeKB: options.targetSizeKB || 50,
            maxWidth: options.maxWidth || 4096,
            maxHeight: options.maxHeight || 4096,
            maintainAspectRatio: options.maintainAspectRatio !== false,
            minQuality: options.minQuality || 0.1,
            maxQuality: options.maxQuality || 0.92,
            stepQuality: options.stepQuality || 0.05,
            format: options.format || 'auto'
        };
    }

    /**
     * Compress a single image file down to (approximately) options.targetSizeKB.
     * Skips compression if the file is already under the target, and falls
     * back to the original file if compression would make it larger.
     * @param {File} file - Source image file.
     * @returns {Promise<{blob: Blob, info: object}>} The resulting blob and stats about the compression.
     */
    async compress(file) {
        try {
            const img = await this.loadImage(file);
            const originalSize = file.size / 1024;

            // CHECK: if original file is already smaller than target, KEEP AS IS
            if (originalSize <= this.options.targetSizeKB) {
                return {
                    blob: file,
                    info: {
                        originalSize: originalSize,
                        compressedSize: originalSize,
                        compressionRatio: '0.00',
                        originalDimensions: { width: img.width, height: img.height },
                        finalDimensions: { width: img.width, height: img.height },
                        quality: 'original',
                        format: file.type
                    }
                };
            }

            const format = this.selectOptimalFormat(file.type);
            
            const dimensions = this.calculateOptimalDimensions(
                img.width, 
                img.height,
                originalSize
            );

            const result = await this.compressWithBinarySearch(
                img,
                dimensions.width,
                dimensions.height,
                format
            );

            let finalResult = result;
            
            // If still larger than target, try more aggressive compression
            if (result.blob.size / 1024 > this.options.targetSizeKB) {
                finalResult = await this.advancedCompress(img, format);
            }

            // IMPORTANT: if compressed file is larger than original, RETURN THE ORIGINAL FILE
            if (finalResult.blob.size > file.size) {
                return {
                    blob: file,
                    info: {
                        originalSize: originalSize,
                        compressedSize: originalSize,
                        compressionRatio: '0.00',
                        originalDimensions: { width: img.width, height: img.height },
                        finalDimensions: { width: img.width, height: img.height },
                        quality: 'original',
                        format: file.type
                    }
                };
            }

            return {
                blob: finalResult.blob,
                info: {
                    originalSize: originalSize,
                    compressedSize: finalResult.blob.size / 1024,
                    compressionRatio: ((1 - (finalResult.blob.size / file.size)) * 100).toFixed(2),
                    originalDimensions: { width: img.width, height: img.height },
                    finalDimensions: finalResult.dimensions,
                    quality: finalResult.quality,
                    format: format
                }
            };
        } catch (error) {
            console.error('Magic compression error:', error);
            throw error;
        }
    }

    /**
     * Load a File into an HTMLImageElement, revoking the temporary object URL once loaded/failed.
     * @param {File} file
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Failed to load image'));
            };
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Pick the output MIME type to encode to. Currently always resolves to
     * JPEG when options.format is 'auto', since it compresses better than PNG for photos.
     * @param {string} originalType - The source file's MIME type.
     * @returns {string} Output MIME type.
     */
    selectOptimalFormat(originalType) {
        if (this.options.format !== 'auto') {
            return this.options.format;
        }

        // Prefer JPEG for better compression
        if (originalType === 'image/png') {
            return 'image/jpeg';
        }

        return 'image/jpeg';
    }

    /**
     * Estimate output dimensions by scaling down proportionally to the target/current size ratio.
     * Leaves dimensions untouched if the file is already close to the target size.
     * @param {number} width - Original width.
     * @param {number} height - Original height.
     * @param {number} currentSizeKB - Original file size in KB.
     * @returns {{width: number, height: number}}
     */
    calculateOptimalDimensions(width, height, currentSizeKB) {
        const targetSizeKB = this.options.targetSizeKB;
        
        // If close to target, keep as is
        if (currentSizeKB <= targetSizeKB * 1.3) {
            return { width, height };
        }

        // Calculate scale factor
        const scaleFactor = Math.sqrt(targetSizeKB / currentSizeKB) * 0.9;
        let newWidth = Math.floor(width * scaleFactor);
        let newHeight = Math.floor(height * scaleFactor);

        if (newWidth > this.options.maxWidth) {
            newWidth = this.options.maxWidth;
            newHeight = Math.floor((height * newWidth) / width);
        }
        if (newHeight > this.options.maxHeight) {
            newHeight = this.options.maxHeight;
            newWidth = Math.floor((width * newHeight) / height);
        }

        newWidth = Math.max(200, newWidth);
        newHeight = Math.max(200, newHeight);

        return { width: newWidth, height: newHeight };
    }

    /**
     * Binary-search the JPEG/WebP quality parameter to hit options.targetSizeKB
     * within a 10% tolerance, at a fixed output size.
     * @param {HTMLImageElement} img
     * @param {number} width - Output width.
     * @param {number} height - Output height.
     * @param {string} format - Output MIME type.
     * @returns {Promise<{blob: Blob, quality: number, dimensions: {width: number, height: number}}>}
     */
    async compressWithBinarySearch(img, width, height, format) {
        let minQuality = this.options.minQuality;
        let maxQuality = this.options.maxQuality;
        let bestBlob = null;
        let bestQuality = maxQuality;
        const targetSize = this.options.targetSizeKB * 1024;
        const tolerance = targetSize * 0.1;

        let iterations = 0;
        const maxIterations = 12;

        while (maxQuality - minQuality > 0.03 && iterations < maxIterations) {
            iterations++;
            const quality = (minQuality + maxQuality) / 2;
            const blob = await this.createBlob(img, width, height, format, quality);

            if (Math.abs(blob.size - targetSize) <= tolerance) {
                return {
                    blob: blob,
                    quality: quality,
                    dimensions: { width, height }
                };
            }

            if (blob.size <= targetSize) {
                bestBlob = blob;
                bestQuality = quality;
                minQuality = quality;
            } else {
                maxQuality = quality;
            }
        }

        if (!bestBlob) {
            bestBlob = await this.createBlob(img, width, height, format, minQuality);
            bestQuality = minQuality;
        }

        return {
            blob: bestBlob,
            quality: bestQuality,
            dimensions: { width, height }
        };
    }

    /**
     * Fallback used when quality-only compression can't reach the target size:
     * progressively downscale the image (90% -> 30% of original) and re-run
     * the quality binary search at each step until the target is met.
     * @param {HTMLImageElement} img
     * @param {string} format - Output MIME type.
     * @returns {Promise<{blob: Blob, quality: number, dimensions: {width: number, height: number}}>}
     */
    async advancedCompress(img, format) {
        const targetSize = this.options.targetSizeKB * 1024;
        let currentWidth = img.width;
        let currentHeight = img.height;
        
        const reductionSteps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
        
        for (const scale of reductionSteps) {
            currentWidth = Math.floor(img.width * scale);
            currentHeight = Math.floor(img.height * scale);

            if (currentWidth < 150 || currentHeight < 150) {
                break;
            }

            const result = await this.compressWithBinarySearch(
                img,
                currentWidth,
                currentHeight,
                format
            );

            if (result.blob.size <= targetSize) {
                return result;
            }
        }

        // Final fallback
        const minWidth = Math.max(150, currentWidth);
        const minHeight = Math.max(150, currentHeight);
        
        return {
            blob: await this.createBlob(img, minWidth, minHeight, format, 0.5),
            quality: 0.5,
            dimensions: { width: minWidth, height: minHeight }
        };
    }

    /**
     * Draw an image onto a canvas at the given size and encode it to a blob.
     * Fills a white background first when encoding to JPEG (which has no alpha channel).
     * @param {HTMLImageElement} img
     * @param {number} width
     * @param {number} height
     * @param {string} format - Output MIME type.
     * @param {number} quality - Encoder quality, 0-1 (ignored for lossless formats like PNG).
     * @returns {Promise<Blob>}
     */
    createBlob(img, width, height, format, quality) {
        return new Promise((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false
            });
            
            // Fill white background for JPEG
            if (format === 'image/jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
            }
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob'));
                    }
                },
                format,
                quality
            );
        });
    }

    /**
     * Compress a batch of files sequentially, collecting per-file success/error results.
     * @param {File[]} files
     * @param {(percent: number, current: number, total: number) => void} [onProgress] - Called after each file.
     * @returns {Promise<object[]>} One result per file (either {success:true,...compress() result} or {success:false, error}).
     */
    async compressMultiple(files, onProgress) {
        const results = [];
        
        for (let i = 0; i < files.length; i++) {
            try {
                const result = await this.compress(files[i]);
                results.push({
                    success: true,
                    fileName: files[i].name,
                    ...result
                });
            } catch (error) {
                results.push({
                    success: false,
                    fileName: files[i].name,
                    error: error.message
                });
            }
            
            if (onProgress) {
                onProgress((i + 1) / files.length * 100, i + 1, files.length);
            }
        }
        
        return results;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MagicImageCompressor;
}
