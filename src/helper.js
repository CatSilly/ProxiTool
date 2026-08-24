/**
 * Keeps track of the files the user has added to the app, along with
 * per-file metadata (id, formatted size, preview URL). Notifies
 * subscribers via onChange() whenever the file list changes.
 */
class FileManager {
    constructor() {
        this.files = [];
        this.listeners = [];
    }

    /**
     * Wrap raw File objects into internal file records and add them to the list.
     * @param {File[]} newFiles - Files selected or dropped by the user.
     * @param {string} [mode='image'] - 'image' generates an object URL preview; any other mode skips it.
     */
    addFiles(newFiles, mode = 'image') {
        newFiles.forEach(file => {
            const fileData = {
                file: file,
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                size: file.size,
                sizeFormatted: this.formatFileSize(file.size),
                type: file.type,
                preview: mode === 'image' ? URL.createObjectURL(file) : null,
                timestamp: Date.now()
            };
            this.files.push(fileData);
        });
        this.notifyListeners();
    }

    /**
     * Remove a single file by id, revoking its preview URL if one exists.
     * @param {string} id
     */
    removeFile(id) {
        const file = this.files.find(f => f.id === id);
        if (file && file.preview) {
            URL.revokeObjectURL(file.preview);
        }
        this.files = this.files.filter(f => f.id !== id);
        this.notifyListeners();
    }

    /** Remove all files and revoke every preview URL to avoid memory leaks. */
    clearAll() {
        this.files.forEach(f => f.preview && URL.revokeObjectURL(f.preview));
        this.files = [];
        this.notifyListeners();
    }

    /** @returns {object[]} All tracked file records. */
    getAll() {
        return this.files;
    }

    /**
     * @param {string} id
     * @returns {object|undefined} The matching file record, if any.
     */
    getById(id) {
        return this.files.find(f => f.id === id);
    }

    /**
     * Subscribe to file-list changes.
     * @param {(files: object[]) => void} callback - Called with the full file list on every change.
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /** Notify all subscribers with the current file list. */
    notifyListeners() {
        this.listeners.forEach(callback => callback(this.files));
    }

    /**
     * Format a byte count as a human-readable string (e.g. "1.5 MB").
     * @param {number} bytes
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }
}

/**
 * Wires up a file input plus a drop zone (click-to-browse and
 * drag-and-drop), filters selected files against an accept list, and
 * forwards valid files to the caller via options.onFilesSelected.
 */
class UploadHandler {
    /**
     * @param {HTMLInputElement} fileInput - The hidden/native file input element.
     * @param {HTMLElement} uploadArea - The clickable/droppable container.
     * @param {object} [options]
     * @param {string} [options.accept='image/*'] - Comma-separated MIME types or wildcard categories (e.g. 'image/*').
     * @param {boolean} [options.multiple=true] - Whether multiple files can be selected at once.
     * @param {(files: File[]) => void} [options.onFilesSelected] - Called with the valid files once selected/dropped.
     * @param {(message: string) => void} [options.onError] - Called when no valid files were found.
     */
    constructor(fileInput, uploadArea, options = {}) {
        this.fileInput = fileInput;
        this.uploadArea = uploadArea;
        this.options = {
            accept: options.accept || 'image/*',
            multiple: options.multiple !== false,
            onFilesSelected: options.onFilesSelected || (() => {}),
            onError: options.onError || console.error
        };
        
        this.init();
    }

    /** Attach click, change, and drag-and-drop listeners to the input/drop zone. */
    init() {
        this.uploadArea.addEventListener('click', (e) => {
            if (e.target === this.fileInput) return;
            e.preventDefault();
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            this.handleFiles(Array.from(e.target.files));
            this.fileInput.value = '';
        });

        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        this.fileInput.accept = this.options.accept;
        this.fileInput.multiple = this.options.multiple;
    }

    /** Highlight the drop zone while a drag is over it. */
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.style.borderColor = '#a855f7';
        this.uploadArea.style.background = '#faf5ff';
    }

    /** Remove the drop-zone highlight when the drag leaves. */
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.style.borderColor = '';
        this.uploadArea.style.background = '';
    }

    /** Clear the highlight and hand off dropped files to handleFiles(). */
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.style.borderColor = '';
        this.uploadArea.style.background = '';
        
        const files = Array.from(e.dataTransfer.files);
        this.handleFiles(files);
    }

    /**
     * Validate files against the accept filter and report success/error via callbacks.
     * @param {File[]} files
     */
    handleFiles(files) {
        const validFiles = this.validateFiles(files);
        
        if (validFiles.length === 0) {
            this.options.onError('No valid files selected');
            return;
        }

        this.options.onFilesSelected(validFiles);
    }

    /**
     * Filter files down to those matching this.options.accept (MIME type or 'category/*' wildcard).
     * @param {File[]} files
     * @returns {File[]}
     */
    validateFiles(files) {
        const acceptTypes = this.options.accept.split(',').map(t => t.trim());
        
        return files.filter(file => {
            if (this.options.accept === '*' || this.options.accept === '*/*') {
                return true;
            }

            for (let acceptType of acceptTypes) {
                if (acceptType.endsWith('/*')) {
                    const category = acceptType.split('/')[0];
                    if (file.type.startsWith(category + '/')) {
                        return true;
                    }
                } else if (acceptType === file.type) {
                    return true;
                }
            }
            return false;
        });
    }

    /**
     * Change which file types the input/drop zone accepts.
     * @param {string} accept - Comma-separated MIME types or 'category/*' wildcards.
     */
    setAccept(accept) {
        this.options.accept = accept;
        this.fileInput.accept = accept;
    }
}

/** Small DOM convenience helpers for showing/hiding elements and toggling a button's loading state. */
const UIHelper = {
    /** @param {HTMLElement} element */
    show(element) {
        if (element) element.classList.remove('hidden');
    },

    /** @param {HTMLElement} element */
    hide(element) {
        if (element) element.classList.add('hidden');
    },

    /** @param {HTMLElement} element */
    toggle(element) {
        if (element) element.classList.toggle('hidden');
    },

    /**
     * @param {HTMLElement} element
     * @param {string} text
     */
    setText(element, text) {
        if (element) element.textContent = text;
    },

    /**
     * @param {HTMLElement} element
     * @param {string} html
     */
    setHTML(element, html) {
        if (element) element.innerHTML = html;
    },

    /**
     * @param {HTMLElement} element
     * @param {string} className
     */
    addClass(element, className) {
        if (element) element.classList.add(className);
    },

    /**
     * @param {HTMLElement} element
     * @param {string} className
     */
    removeClass(element, className) {
        if (element) element.classList.remove(className);
    },

    /**
     * Disable a button and replace its label with a spinner + loading text.
     * The original label is stashed in dataset.originalText for hideLoading() to restore.
     * @param {HTMLButtonElement} button
     * @param {string} [loadingText='Processing...']
     */
    showLoading(button, loadingText = 'Processing...') {
        if (!button) return;
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.innerHTML = `
            <svg class="spinner" width="20" height="20" viewBox="0 0 24 24" style="display: inline-block; margin-right: 8px;">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none"/>
            </svg>
            ${loadingText}
        `;
    },

    /**
     * Re-enable a button and restore the label saved by showLoading().
     * @param {HTMLButtonElement} button
     */
    hideLoading(button) {
        if (!button) return;
        button.disabled = false;
        if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
        }
    }
};

/** Image loading/canvas utilities shared by the converters. */
const ImageHelper = {
    /**
     * Load a File into an HTMLImageElement via an object URL.
     * @param {File} file
     * @returns {Promise<HTMLImageElement>}
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    },

    /**
     * Draw an image onto a new canvas at the given size.
     * @param {HTMLImageElement} img
     * @param {number} width
     * @param {number} height
     * @returns {HTMLCanvasElement}
     */
    createCanvas(img, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        return canvas;
    },

    /**
     * Convert a canvas to a Blob.
     * @param {HTMLCanvasElement} canvas
     * @param {string} [mimeType='image/png']
     * @param {number} [quality=0.95] - Only applies to lossy formats (e.g. image/jpeg, image/webp).
     * @returns {Promise<Blob>}
     */
    canvasToBlob(canvas, mimeType = 'image/png', quality = 0.95) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Failed to create blob'));
                },
                mimeType,
                quality
            );
        });
    },

    /**
     * @param {File} file
     * @returns {Promise<{width: number, height: number}>}
     */
    async getImageDimensions(file) {
        const img = await this.loadImage(file);
        return { width: img.width, height: img.height };
    },

    /**
     * Scale (srcWidth, srcHeight) down to fit within (maxWidth, maxHeight) while preserving aspect ratio.
     * @param {number} srcWidth
     * @param {number} srcHeight
     * @param {number} maxWidth
     * @param {number} maxHeight
     * @returns {{width: number, height: number}}
     */
    calculateAspectRatioFit(srcWidth, srcHeight, maxWidth, maxHeight) {
        const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
        return {
            width: Math.round(srcWidth * ratio),
            height: Math.round(srcHeight * ratio)
        };
    }
};

/** Triggers browser downloads for Blob results, one at a time or in a staggered batch. */
const DownloadHelper = {
    /**
     * Trigger a browser download for a single blob via a temporary <a> element.
     * @param {Blob} blob
     * @param {string} filename
     */
    downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    },

    /**
     * Download multiple files, staggered to avoid the browser blocking rapid downloads.
     * @param {{blob: Blob, name: string}[]} files
     * @param {number} [delay=200] - Milliseconds between each download.
     */
    downloadMultiple(files, delay = 200) {
        files.forEach((file, index) => {
            setTimeout(() => {
                this.downloadFile(file.blob, file.name);
            }, index * delay);
        });
    }
};

/** Shows dismissible toast-style notifications in the top-right corner. */
const NotificationHelper = {
    /**
     * Show a toast notification that auto-dismisses after `duration` ms.
     * @param {string} message
     * @param {'info'|'success'|'error'} [type='info']
     * @param {number} [duration=3000]
     */
    show(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, duration);
    },

    /** @param {string} message @param {number} [duration] */
    success(message, duration) {
        this.show(message, 'success', duration);
    },

    /** @param {string} message @param {number} [duration] */
    error(message, duration) {
        this.show(message, 'error', duration);
    },

    /** @param {string} message @param {number} [duration] */
    info(message, duration) {
        this.show(message, 'info', duration);
    }
};

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FileManager,
        UploadHandler,
        UIHelper,
        ImageHelper,
        DownloadHelper,
        NotificationHelper
    };
}
