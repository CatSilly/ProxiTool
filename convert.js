let convertedFiles = [];
let currentMode = 'image';

const fileManager = new FileManager();

const magicCompressor = new MagicImageCompressor();
const spritesheetGenerator = new SpritesheetGenerator();
const audioConverter = new AudioConverter();

const imageMode = document.getElementById('imageMode');
const audioMode = document.getElementById('audioMode');
const magicMode = document.getElementById('magicMode');
const imageSettings = document.getElementById('imageSettings');
const audioSettings = document.getElementById('audioSettings');
const magicSettings = document.getElementById('magicSettings');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const emptyState = document.getElementById('emptyState');
const fileCount = document.getElementById('fileCount');
const clearAll = document.getElementById('clearAll');
const convertSection = document.getElementById('convertSection');
const convertBtn = document.getElementById('convertBtn');
const convertCount = document.getElementById('convertCount');
const convertedSection = document.getElementById('convertedSection');
const convertedList = document.getElementById('convertedList');
const convertedCount = document.getElementById('convertedCount');
const downloadAll = document.getElementById('downloadAll');
const resetBtn = document.getElementById('resetBtn');
const resizeOption = document.getElementById('resizeOption');
const customSize = document.getElementById('customSize');
const fileType = document.getElementById('fileType');
const spritesheetMode = document.getElementById('spritesheetMode');
const spritesheetSettings = document.getElementById('spritesheetSettings');
const spritesheetLayout = document.getElementById('spritesheetLayout');
const customGrid = document.getElementById('customGrid');
const spriteBackground = document.getElementById('spriteBackground');
const customColor = document.getElementById('customColor');
const spritesheetPreview = document.getElementById('spritesheetPreview');
const closePreview = document.getElementById('closePreview');

const uploadHandler = new UploadHandler(fileInput, uploadArea, {
    accept: 'image/*',
    multiple: true,
    onFilesSelected: (files) => {
        fileManager.addFiles(files, currentMode === 'audio' ? 'audio' : 'image');
        NotificationHelper.success(`Added ${files.length} file(s)`);
    },
    onError: (message) => {
        NotificationHelper.error(message);
    }
});

spritesheetMode.addEventListener('click', () => switchMode('spritesheet'));
spritesheetLayout.addEventListener('change', toggleCustomGrid);
spriteBackground.addEventListener('change', toggleCustomColor);
if (closePreview) {
    closePreview.addEventListener('click', () => UIHelper.hide(spritesheetPreview));
}

imageMode.addEventListener('click', () => switchMode('image'));
audioMode.addEventListener('click', () => switchMode('audio'));
magicMode.addEventListener('click', () => switchMode('magic'));
clearAll.addEventListener('click', () => fileManager.clearAll());
convertBtn.addEventListener('click', handleConvert);
downloadAll.addEventListener('click', downloadAllFiles);
resetBtn.addEventListener('click', reset);
resizeOption.addEventListener('change', toggleCustomSize);

const audioFormatSelect = document.getElementById('audioFormat');
const audioBitrateGroup = document.getElementById('audioBitrateGroup');
const audioVolume = document.getElementById('audioVolume');
const audioVolumeValue = document.getElementById('audioVolumeValue');

if (audioFormatSelect) {
    audioFormatSelect.addEventListener('change', () => {
        if (audioFormatSelect.value === 'wav') {
            UIHelper.hide(audioBitrateGroup);
        } else {
            UIHelper.show(audioBitrateGroup);
        }
    });
}

if (audioVolume) {
    audioVolume.addEventListener('input', () => {
        audioVolumeValue.textContent = audioVolume.value + '%';
    });
}

fileManager.onChange((files) => {
    updateFileList(files);
});

function switchMode(mode) {
    currentMode = mode;
    
    // Remove all active classes
    UIHelper.removeClass(imageMode, 'active');
    UIHelper.removeClass(audioMode, 'active');
    UIHelper.removeClass(magicMode, 'active');
    UIHelper.removeClass(spritesheetMode, 'active');
    
    // Hide all settings
    UIHelper.hide(imageSettings);
    UIHelper.hide(audioSettings);
    UIHelper.hide(magicSettings);
    UIHelper.hide(spritesheetSettings);
    
    if (mode === 'image') {
        UIHelper.addClass(imageMode, 'active');
        UIHelper.show(imageSettings);
        uploadHandler.setAccept('image/*');
        UIHelper.setText(fileType, 'images');
    } else if (mode === 'magic') {
        UIHelper.addClass(magicMode, 'active');
        UIHelper.show(magicSettings);
        uploadHandler.setAccept('image/*');
        UIHelper.setText(fileType, 'images');
    } else if (mode === 'spritesheet') {
        UIHelper.addClass(spritesheetMode, 'active');
        UIHelper.show(spritesheetSettings);
        uploadHandler.setAccept('image/*');
        UIHelper.setText(fileType, 'images for spritesheet');
    } else if (mode === 'audio') {
        UIHelper.addClass(audioMode, 'active');
        UIHelper.show(audioSettings);
        uploadHandler.setAccept('audio/*');
        UIHelper.setText(fileType, 'audio files');
    }
    
    fileManager.clearAll();
}

// Thêm hàm toggle
function toggleCustomGrid() {
    if (spritesheetLayout.value === 'custom') {
        UIHelper.show(customGrid);
    } else {
        UIHelper.hide(customGrid);
    }
}

function toggleCustomColor() {
    if (spriteBackground.value === 'custom') {
        UIHelper.show(customColor);
    } else {
        UIHelper.hide(customColor);
    }
}

function toggleCustomSize() {
    if (resizeOption.value === 'custom') {
        UIHelper.show(customSize);
    } else {
        UIHelper.hide(customSize);
    }
}

function updateFileList(files) {
    UIHelper.setText(fileCount, files.length);
    
    if (files.length === 0) {
        UIHelper.setHTML(fileList, '');
        UIHelper.show(emptyState);
        UIHelper.hide(clearAll);
        UIHelper.hide(convertSection);
    } else {
        UIHelper.hide(emptyState);
        UIHelper.show(clearAll);
        UIHelper.show(convertSection);
        UIHelper.setText(convertCount, files.length);
        
        const html = files.map(file => `
            <div class="file-item" data-id="${file.id}">
                ${file.preview ? 
                    `<img src="${file.preview}" alt="" class="file-preview">` :
                    `<div class="file-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18V5l12-2v13"></path>
                            <circle cx="6" cy="18" r="3"></circle>
                            <circle cx="18" cy="16" r="3"></circle>
                        </svg>
                    </div>`
                }
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${file.sizeFormatted}</div>
                </div>
                <button class="remove-btn" onclick="removeFile('${file.id}')">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');
        
        UIHelper.setHTML(fileList, html);
    }
}

function removeFile(id) {
    fileManager.removeFile(id);
}

async function handleConvert() {
    const files = fileManager.getAll();
    if (files.length === 0) return;
    
    if (currentMode === 'spritesheet') {
        if (files.length < 2) {
            NotificationHelper.error('Please select at least 2 images for spritesheet');
            return;
        }
        await handleSpritesheetConvert(files);
        return;
    }
    
        UIHelper.showLoading(convertBtn, 'Processing...');
    convertedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        try {
            let blob;
            let outputFormat;
            let info = null;
            
            if (currentMode === 'magic') {
                const targetSize = parseInt(document.getElementById('targetSize').value) || 50;
                const format = document.getElementById('magicFormat').value;
                
                magicCompressor.options.targetSizeKB = targetSize;
                magicCompressor.options.format = format;
                
                const result = await magicCompressor.compress(fileData.file);
                blob = result.blob;
                info = result.info;
                
                if (info.format === 'image/jpeg') {
                    outputFormat = 'jpg';
                } else if (info.format === 'image/webp') {
                    outputFormat = 'webp';
                } else if (info.format === 'image/png') {
                    outputFormat = 'png';
                } else {
                    outputFormat = 'jpg';
                }
            } else if (currentMode === 'image') {
                const format = document.getElementById('imageFormat').value;
                const resize = resizeOption.value;
                blob = await convertImage(fileData.file, format, resize);
                outputFormat = format;
            } else if (currentMode === 'audio') {
                const audioFormat = document.getElementById('audioFormat').value;
                const sampleRate = document.getElementById('audioSampleRate').value;
                const channels = document.getElementById('audioChannels').value;
                const bitrate = document.getElementById('audioBitrate').value;
                const volumePct = parseInt(document.getElementById('audioVolume').value) || 100;
                const normalize = document.getElementById('audioNormalize').checked;
                const trim = document.getElementById('audioTrimSilence').checked;

                const result = await audioConverter.convert(fileData.file, {
                    format: audioFormat,
                    sampleRate: sampleRate,
                    channels: channels,
                    bitrate: bitrate,
                    volume: volumePct / 100,
                    normalize: normalize,
                    trim: trim
                });

                blob = result.blob;
                info = result.info;
                outputFormat = audioFormat;
            }
            
            const originalName = fileData.name.substring(0, fileData.name.lastIndexOf('.'));
            const suffix = currentMode === 'magic' ? 'magic' : currentMode === 'audio' ? 'audio' : 'converted';
            const newFileName = `${originalName}_${suffix}.${outputFormat}`;
            
            convertedFiles.push({
                id: fileData.id,
                name: newFileName,
                blob: blob,
                url: URL.createObjectURL(blob),
                size: fileManager.formatFileSize(blob.size),
                info: info
            });
        } catch (error) {
            console.error('Conversion error:', error);
            NotificationHelper.error(`Error processing ${fileData.name}`);
        }
    }
    
    UIHelper.hideLoading(convertBtn);
    
    if (convertedFiles.length > 0) {
        const modeText = currentMode === 'magic' ? 'compressed' : 'converted';
        NotificationHelper.success(`Successfully ${modeText} ${convertedFiles.length} file(s)`);
        showConvertedFiles();
    } else {
        NotificationHelper.error('No files were processed successfully');
    }
}

async function handleSpritesheetConvert(files) {
    UIHelper.showLoading(convertBtn, 'Generating spritesheet...');
    
    try {
        const layout = spritesheetLayout.value;
        const padding = parseInt(document.getElementById('spritePadding').value) || 0;
        let bgColor = spriteBackground.value;
        
        if (bgColor === 'custom') {
            bgColor = document.getElementById('customBgColor').value;
        }
        
        const columns = layout === 'custom' ? parseInt(document.getElementById('gridColumns').value) || null : null;
        const rows = layout === 'custom' ? parseInt(document.getElementById('gridRows').value) || null : null;
        
        spritesheetGenerator.options = {
            layout: layout === 'custom' ? 'square' : layout,
            padding: padding,
            backgroundColor: bgColor,
            maxSize: 4096,
            columns: columns,
            rows: rows
        };
        
        const fileList = files.map(f => f.file);
        const result = await spritesheetGenerator.generate(fileList);
        
        // Show preview
        showSpritesheetPreview(result);
        
        convertedFiles = [{
            id: 'spritesheet',
            name: 'spritesheet.png',
            blob: result.blob,
            url: URL.createObjectURL(result.blob),
            size: fileManager.formatFileSize(result.blob.size),
            info: result.info
        }];
        
        // Export metadata nếu được chọn
        if (document.getElementById('exportMetadata').checked) {
            const metadataBlob = spritesheetGenerator.exportMetadata(
                result.preview.images.map((img, i) => ({
                    name: files[i].name,
                    width: img.dimensions.width,
                    height: img.dimensions.height
                })),
                result.layout,
                'spritesheet.png'
            );
            
            convertedFiles.push({
                id: 'metadata',
                name: 'spritesheet.json',
                blob: metadataBlob,
                url: URL.createObjectURL(metadataBlob),
                size: fileManager.formatFileSize(metadataBlob.size),
                info: { metadata: true }
            });
        }
        
        UIHelper.hideLoading(convertBtn);
        NotificationHelper.success('Spritesheet generated successfully!');
        showConvertedFiles();
        
    } catch (error) {
        console.error('Spritesheet generation error:', error);
        UIHelper.hideLoading(convertBtn);
        NotificationHelper.error(`Error: ${error.message}`);
    }
}

function showSpritesheetPreview(result) {
    const previewCanvas = document.getElementById('previewCanvas');
    const previewInfo = document.getElementById('previewInfo');
    
    previewCanvas.width = result.canvas.width;
    previewCanvas.height = result.canvas.height;
    
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(result.canvas, 0, 0);
    
    const info = result.info;
    const grid = result.preview.grid;
    
    previewInfo.innerHTML = `
        <h4>Spritesheet Information</h4>
        <div class="preview-grid">
            <div class="preview-stat">
                <label>Dimensions</label>
                <value>${info.dimensions.width} × ${info.dimensions.height}px</value>
            </div>
            <div class="preview-stat">
                <label>Total Images</label>
                <value>${info.totalImages}</value>
            </div>
            <div class="preview-stat">
                <label>Grid Layout</label>
                <value>${grid.columns} × ${grid.rows}</value>
            </div>
            <div class="preview-stat">
                <label>Cell Size</label>
                <value>${grid.cellWidth} × ${grid.cellHeight}px</value>
            </div>
            <div class="preview-stat">
                <label>Padding</label>
                <value>${info.padding}px</value>
            </div>
            <div class="preview-stat">
                <label>Layout Type</label>
                <value>${info.layout}</value>
            </div>
        </div>
    `;
    
    UIHelper.show(spritesheetPreview);
}

async function convertImage(file, targetFormat, targetSize) {
    const img = await ImageHelper.loadImage(file);
    
    let width = img.width;
    let height = img.height;
    
    if (targetSize !== 'original') {
        if (targetSize === 'custom') {
            const customW = parseInt(document.getElementById('customWidth').value);
            const customH = parseInt(document.getElementById('customHeight').value);
            width = customW || img.width;
            height = customH || img.height;
        } else {
            const [w, h] = targetSize.split('x').map(Number);
            width = w;
            height = h;
        }
    }
    
    const canvas = ImageHelper.createCanvas(img, width, height);
    const mimeType = targetFormat === 'jpg' || targetFormat === 'jpeg' ? 'image/jpeg' : `image/${targetFormat}`;
    return await ImageHelper.canvasToBlob(canvas, mimeType, 0.95);
}

function showConvertedFiles() {
    UIHelper.setText(convertedCount, convertedFiles.length);
    
    const html = convertedFiles.map(file => {
        let extraInfo = '';
        
        if (file.info && currentMode === 'magic') {
            extraInfo = `<div class="magic-info">
                <small>📊 ${file.info.originalSize.toFixed(2)} KB → ${file.info.compressedSize.toFixed(2)} KB</small>
                <small>💾 Reduced ${file.info.compressionRatio}%</small>
            </div>`;
        } else if (file.info && currentMode === 'spritesheet' && !file.info.metadata) {
            extraInfo = `<div class="spritesheet-info">
                <small>🎮 ${file.info.totalImages} sprites · ${file.info.dimensions.width}×${file.info.dimensions.height}px</small>
                <small>📐 Layout: ${file.info.layout} · Padding: ${file.info.padding}px</small>
            </div>`;
        } else if (file.info && file.info.metadata) {
            extraInfo = `<div class="spritesheet-info">
                <small>📄 Metadata JSON file for game engines</small>
            </div>`;
        } else if (file.info && currentMode === 'audio') {
            const o = file.info.original;
            const out = file.info.output;
            extraInfo = `<div class="audio-info">
                <small>🎵 ${o.sampleRate}Hz/${o.channels}ch → ${out.sampleRate}Hz/${out.channels}ch · ${out.format.toUpperCase()}</small>
                <small>⏱ ${out.duration.toFixed(1)}s</small>
            </div>`;
        }
        
        return `
            <div class="converted-item ${currentMode === 'magic' ? 'magic-item' : currentMode === 'spritesheet' ? 'spritesheet-item' : currentMode === 'audio' ? 'audio-item' : ''}">
                <div class="converted-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${file.size}</div>
                    ${extraInfo}
                </div>
                <button class="download-btn" onclick="downloadFile('${file.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            </div>
        `;
    }).join('');
    
    UIHelper.setHTML(convertedList, html);
    UIHelper.hide(convertSection);
    UIHelper.show(convertedSection);
}

function downloadFile(id) {
    const file = convertedFiles.find(f => f.id === id);
    if (file) {
        DownloadHelper.downloadFile(file.blob, file.name);
    }
}

function downloadAllFiles() {
    DownloadHelper.downloadMultiple(convertedFiles);
    NotificationHelper.success('Downloading all files...');
}

function reset() {
    convertedFiles.forEach(f => URL.revokeObjectURL(f.url));
    fileManager.clearAll();
    convertedFiles = [];
    UIHelper.hide(convertedSection);
    NotificationHelper.info('Reset');
}