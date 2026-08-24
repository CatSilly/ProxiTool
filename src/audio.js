/* ===== AUDIO CONVERTER ===== */
/* Pure browser-side audio conversion via Web Audio API.
   WAV is encoded natively. MP3 encoding uses lamejs (loaded from CDN). */

class AudioConverter {
    constructor() {
        this.ctx = null;
    }

    getContext() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.ctx;
    }

    async decode(file) {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = this.getContext();
        // decodeAudioData mutates the buffer on some browsers, so clone isn't needed since it's one-shot
        return await ctx.decodeAudioData(arrayBuffer.slice(0));
    }

    /**
     * Render an AudioBuffer to a new sample rate / channel count using OfflineAudioContext.
     */
    async resample(buffer, targetSampleRate, targetChannels) {
        const channels = targetChannels || buffer.numberOfChannels;
        const duration = buffer.duration;
        const length = Math.ceil(duration * targetSampleRate);

        const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offlineCtx = new OfflineCtx(channels, length, targetSampleRate);

        const source = offlineCtx.createBufferSource();

        // If channel count needs to change, build a new source buffer first
        let sourceBuffer = buffer;
        if (buffer.numberOfChannels !== channels) {
            sourceBuffer = this.remapChannels(buffer, channels);
        }

        source.buffer = sourceBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        return await offlineCtx.startRendering();
    }

    /**
     * Create a new AudioBuffer with a different channel count (mono <-> stereo).
     */
    remapChannels(buffer, targetChannels) {
        const ctx = this.getContext();
        const out = ctx.createBuffer(targetChannels, buffer.length, buffer.sampleRate);

        if (targetChannels === 1) {
            // Downmix to mono by averaging all channels
            const mixed = new Float32Array(buffer.length);
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                const data = buffer.getChannelData(ch);
                for (let i = 0; i < buffer.length; i++) {
                    mixed[i] += data[i] / buffer.numberOfChannels;
                }
            }
            out.copyToChannel(mixed, 0);
        } else {
            // Upmix mono -> stereo (or duplicate first channel into extras)
            const srcChannels = buffer.numberOfChannels;
            for (let ch = 0; ch < targetChannels; ch++) {
                const srcCh = Math.min(ch, srcChannels - 1);
                out.copyToChannel(buffer.getChannelData(srcCh), ch);
            }
        }

        return out;
    }

    /**
     * Apply a linear gain multiplier to all samples (used for normalize / volume boost).
     */
    applyGain(buffer, gain) {
        if (gain === 1) return buffer;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                let v = data[i] * gain;
                if (v > 1) v = 1;
                if (v < -1) v = -1;
                data[i] = v;
            }
        }
        return buffer;
    }

    /**
     * Find the peak absolute sample value across all channels.
     */
    getPeak(buffer) {
        let peak = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                const v = Math.abs(data[i]);
                if (v > peak) peak = v;
            }
        }
        return peak;
    }

    /**
     * Trim silence from the start/end of the buffer.
     */
    trimSilence(buffer, threshold = 0.01) {
        const length = buffer.length;
        let start = 0;
        let end = length;

        const isSilent = (i) => {
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                if (Math.abs(buffer.getChannelData(ch)[i]) > threshold) return false;
            }
            return true;
        };

        while (start < length && isSilent(start)) start++;
        while (end > start && isSilent(end - 1)) end--;

        if (start === 0 && end === length) return buffer;
        if (start >= end) return buffer; // entirely silent, don't trim everything away

        const ctx = this.getContext();
        const newLength = end - start;
        const out = ctx.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            out.copyToChannel(buffer.getChannelData(ch).subarray(start, end), ch);
        }
        return out;
    }

    /**
     * Encode an AudioBuffer to a WAV Blob (16-bit PCM).
     */
    encodeWAV(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const numFrames = buffer.length;
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const dataSize = numFrames * blockAlign;
        const bufferSize = 44 + dataSize;

        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        const channelData = [];
        for (let ch = 0; ch < numChannels; ch++) {
            channelData.push(buffer.getChannelData(ch));
        }

        let offset = 44;
        for (let i = 0; i < numFrames; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, sample, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    /**
     * Encode an AudioBuffer to MP3 using lamejs.
     */
    encodeMP3(buffer, bitrate = 128) {
        if (typeof lamejs === 'undefined') {
            throw new Error('MP3 encoder not loaded');
        }

        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);

        const samplesLeft = this.floatTo16BitPCM(buffer.getChannelData(0));
        const samplesRight = numChannels > 1 ? this.floatTo16BitPCM(buffer.getChannelData(1)) : null;

        const blockSize = 1152;
        const mp3Data = [];

        for (let i = 0; i < samplesLeft.length; i += blockSize) {
            const leftChunk = samplesLeft.subarray(i, i + blockSize);
            let mp3buf;
            if (numChannels > 1) {
                const rightChunk = samplesRight.subarray(i, i + blockSize);
                mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
            } else {
                mp3buf = mp3encoder.encodeBuffer(leftChunk);
            }
            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        const end = mp3encoder.flush();
        if (end.length > 0) {
            mp3Data.push(end);
        }

        return new Blob(mp3Data, { type: 'audio/mp3' });
    }

    floatTo16BitPCM(float32Array) {
        const output = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    /**
     * Full conversion pipeline.
     * options: { format, sampleRate, channels, bitrate, normalize, trim, volume }
     */
    async convert(file, options) {
        let buffer = await this.decode(file);
        const originalInfo = {
            duration: buffer.duration,
            sampleRate: buffer.sampleRate,
            channels: buffer.numberOfChannels
        };

        const targetSampleRate = options.sampleRate === 'original'
            ? buffer.sampleRate
            : parseInt(options.sampleRate);

        const targetChannels = options.channels === 'original'
            ? buffer.numberOfChannels
            : parseInt(options.channels);

        if (targetSampleRate !== buffer.sampleRate || targetChannels !== buffer.numberOfChannels) {
            buffer = await this.resample(buffer, targetSampleRate, targetChannels);
        }

        if (options.trim) {
            buffer = this.trimSilence(buffer);
        }

        if (options.normalize) {
            const peak = this.getPeak(buffer);
            if (peak > 0 && peak < 0.99) {
                buffer = this.applyGain(buffer, 0.98 / peak);
            }
        } else if (options.volume && options.volume !== 1) {
            buffer = this.applyGain(buffer, options.volume);
        }

        let blob;
        if (options.format === 'mp3') {
            blob = this.encodeMP3(buffer, parseInt(options.bitrate) || 128);
        } else {
            blob = this.encodeWAV(buffer);
        }

        return {
            blob,
            info: {
                original: originalInfo,
                output: {
                    duration: buffer.duration,
                    sampleRate: buffer.sampleRate,
                    channels: buffer.numberOfChannels,
                    format: options.format
                }
            }
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioConverter };
}
