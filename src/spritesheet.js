/**
 * Packs a set of images into a single spritesheet canvas, using a uniform
 * cell size sized to the largest input image. Supports horizontal, vertical,
 * square/auto grid layouts, and can export TexturePacker-style JSON metadata.
 */
class SpritesheetGenerator {
    /**
     * @param {object} [options]
     * @param {'horizontal'|'vertical'|'square'|'auto'} [options.layout='auto'] - Grid arrangement.
     * @param {number} [options.padding=0] - Pixels of padding around and between cells.
     * @param {string} [options.backgroundColor='transparent'] - Fill color, or 'transparent' for none.
     * @param {number} [options.maxSize=4096] - Max canvas width/height in pixels; generate() throws if exceeded.
     * @param {number|null} [options.columns=null] - Force a specific column count (square/auto layout only).
     * @param {number|null} [options.rows=null] - Force a specific row count (square/auto layout only, used if columns isn't set).
     */
    constructor(options = {}) {
        this.options = {
            layout: options.layout || 'auto', // 'horizontal', 'vertical', 'square', 'auto'
            padding: options.padding || 0,
            backgroundColor: options.backgroundColor || 'transparent',
            maxSize: options.maxSize || 4096,
            columns: options.columns || null,
            rows: options.rows || null
        };
    }

    /**
     * Load the given files, lay them out in a grid, and render the spritesheet.
     * @param {File[]} files - Image files to pack. Files that fail to load are skipped.
     * @returns {Promise<{blob: Blob, canvas: HTMLCanvasElement, layout: object, preview: object, info: object}>}
     * @throws {Error} If no images loaded successfully, or the resulting canvas exceeds options.maxSize.
     */
    async generate(files) {
        try {
            // Load all images
            const images = await this.loadImages(files);
            
            if (images.length === 0) {
                throw new Error('No valid images to process');
            }

            // Calculate layout
            const layout = this.calculateLayout(images);
            
            // Create canvas and draw spritesheet
            const canvas = this.createSpritesheet(images, layout);
            
            // Convert sang blob
            const blob = await this.canvasToBlob(canvas);
            
            // Build preview data
            const previewData = this.generatePreviewData(images, layout);
            
            return {
                blob: blob,
                canvas: canvas,
                layout: layout,
                preview: previewData,
                info: {
                    totalImages: images.length,
                    dimensions: {
                        width: canvas.width,
                        height: canvas.height
                    },
                    layout: this.options.layout,
                    padding: this.options.padding
                }
            };
        } catch (error) {
            console.error('Spritesheet generation error:', error);
            throw error;
        }
    }

    /**
     * Load every file into an image record, silently dropping any that fail to load.
     * @param {File[]} files
     * @returns {Promise<object[]>} Loaded image records ({image, width, height, name, file}).
     */
    async loadImages(files) {
        const promises = files.map(file => this.loadImage(file));
        const results = await Promise.allSettled(promises);
        
        return results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);
    }

    /**
     * Load a single file into an HTMLImageElement and wrap it with its metadata.
     * @param {File} file
     * @returns {Promise<{image: HTMLImageElement, width: number, height: number, name: string, file: File}>}
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    image: img,
                    width: img.width,
                    height: img.height,
                    name: file.name,
                    file: file
                });
                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error(`Failed to load ${file.name}`));
            };
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Compute the grid dimensions, uniform cell size, and per-sprite positions
     * for the given images, based on options.layout/columns/rows/padding.
     * @param {object[]} images - Loaded image records from loadImages().
     * @returns {object} Layout info: columns, rows, cellWidth, cellHeight, canvasWidth, canvasHeight, padding, positions.
     * @throws {Error} If the resulting canvas would exceed options.maxSize.
     */
    calculateLayout(images) {
        const layout = this.options.layout;
        const padding = this.options.padding;
        
        let columns, rows;
        let cellWidth = 0;
        let cellHeight = 0;

        // Find the largest dimension
        images.forEach(img => {
            cellWidth = Math.max(cellWidth, img.width);
            cellHeight = Math.max(cellHeight, img.height);
        });

        if (layout === 'horizontal') {
            columns = images.length;
            rows = 1;
        } else if (layout === 'vertical') {
            columns = 1;
            rows = images.length;
        } else if (layout === 'square' || layout === 'auto') {
            // Calculate columns/rows to form the closest square
            if (this.options.columns) {
                columns = this.options.columns;
                rows = Math.ceil(images.length / columns);
            } else if (this.options.rows) {
                rows = this.options.rows;
                columns = Math.ceil(images.length / rows);
            } else {
                columns = Math.ceil(Math.sqrt(images.length));
                rows = Math.ceil(images.length / columns);
            }
        }

        const canvasWidth = (cellWidth * columns) + (padding * (columns + 1));
        const canvasHeight = (cellHeight * rows) + (padding * (rows + 1));

        // Check size limit
        if (canvasWidth > this.options.maxSize || canvasHeight > this.options.maxSize) {
            throw new Error(`Spritesheet too large: ${canvasWidth}x${canvasHeight}. Max size: ${this.options.maxSize}`);
        }

        return {
            columns,
            rows,
            cellWidth,
            cellHeight,
            canvasWidth,
            canvasHeight,
            padding,
            positions: this.calculatePositions(images.length, columns, rows, cellWidth, cellHeight, padding)
        };
    }

    /**
     * Compute the top-left (x, y) position of each cell in row-major order.
     * @param {number} count - Number of sprites to place.
     * @param {number} columns
     * @param {number} rows
     * @param {number} cellWidth
     * @param {number} cellHeight
     * @param {number} padding
     * @returns {{x: number, y: number, width: number, height: number, index: number}[]}
     */
    calculatePositions(count, columns, rows, cellWidth, cellHeight, padding) {
        const positions = [];
        
        for (let i = 0; i < count; i++) {
            const col = i % columns;
            const row = Math.floor(i / columns);
            
            positions.push({
                x: padding + (col * (cellWidth + padding)),
                y: padding + (row * (cellHeight + padding)),
                width: cellWidth,
                height: cellHeight,
                index: i
            });
        }
        
        return positions;
    }

    /**
     * Render all images onto a single canvas at the positions computed by calculateLayout(),
     * centering each image within its cell if it's smaller than the cell.
     * @param {object[]} images - Loaded image records.
     * @param {object} layout - Layout info from calculateLayout().
     * @returns {HTMLCanvasElement}
     */
    createSpritesheet(images, layout) {
        const canvas = document.createElement('canvas');
        canvas.width = layout.canvasWidth;
        canvas.height = layout.canvasHeight;
        
        const ctx = canvas.getContext('2d', {
            alpha: this.options.backgroundColor === 'transparent',
            willReadFrequently: false
        });

        // Draw background
        if (this.options.backgroundColor !== 'transparent') {
            ctx.fillStyle = this.options.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw each image into its corresponding cell
        images.forEach((img, index) => {
            const pos = layout.positions[index];
            
            // Center image within the cell if smaller than the cell
            const offsetX = (layout.cellWidth - img.width) / 2;
            const offsetY = (layout.cellHeight - img.height) / 2;
            
            ctx.drawImage(
                img.image,
                pos.x + offsetX,
                pos.y + offsetY,
                img.width,
                img.height
            );
        });

        return canvas;
    }

    /**
     * Build a lightweight summary of the spritesheet (per-image name/position/size, grid info)
     * for use in UI previews.
     * @param {object[]} images - Loaded image records.
     * @param {object} layout - Layout info from calculateLayout().
     * @returns {object}
     */
    generatePreviewData(images, layout) {
        return {
            images: images.map((img, index) => ({
                name: img.name,
                position: layout.positions[index],
                dimensions: {
                    width: img.width,
                    height: img.height
                }
            })),
            grid: {
                columns: layout.columns,
                rows: layout.rows,
                cellWidth: layout.cellWidth,
                cellHeight: layout.cellHeight
            }
        };
    }

    /**
     * Convert the spritesheet canvas to a Blob.
     * @param {HTMLCanvasElement} canvas
     * @param {string} [format='image/png']
     * @param {number} [quality=1.0] - Only applies to lossy formats.
     * @returns {Promise<Blob>}
     */
    canvasToBlob(canvas, format = 'image/png', quality = 1.0) {
        return new Promise((resolve, reject) => {
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
     * Build TexturePacker-style JSON metadata (frames + meta) describing where
     * each sprite lives within the spritesheet, for use by game engines.
     * @param {{name: string, width: number, height: number}[]} images
     * @param {object} layout - Layout info from calculateLayout() (positions, canvasWidth/Height).
     * @param {string} [spritesheetName='spritesheet.png'] - Filename referenced in the metadata.
     * @returns {object}
     */
    generateMetadata(images, layout, spritesheetName = 'spritesheet.png') {
        const frames = {};
        
        images.forEach((img, index) => {
            const pos = layout.positions[index];
            const frameName = img.name.replace(/\.[^/.]+$/, ''); // Remove extension
            
            frames[frameName] = {
                frame: {
                    x: pos.x,
                    y: pos.y,
                    w: img.width,
                    h: img.height
                },
                rotated: false,
                trimmed: false,
                spriteSourceSize: {
                    x: 0,
                    y: 0,
                    w: img.width,
                    h: img.height
                },
                sourceSize: {
                    w: img.width,
                    h: img.height
                }
            };
        });

        return {
            frames: frames,
            meta: {
                app: 'Proximagic Tool',
                version: '1.0.0',
                image: spritesheetName,
                format: 'RGBA8888',
                size: {
                    w: layout.canvasWidth,
                    h: layout.canvasHeight
                },
                scale: '1',
                layout: this.options.layout,
                padding: this.options.padding
            }
        };
    }

    /**
     * Generate the metadata JSON and package it as a downloadable Blob.
     * @param {{name: string, width: number, height: number}[]} images
     * @param {object} layout - Layout info from calculateLayout().
     * @param {string} spritesheetName - Filename referenced in the metadata.
     * @returns {Blob}
     */
    exportMetadata(images, layout, spritesheetName) {
        const metadata = this.generateMetadata(images, layout, spritesheetName);
        const json = JSON.stringify(metadata, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        return blob;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpritesheetGenerator;
}
