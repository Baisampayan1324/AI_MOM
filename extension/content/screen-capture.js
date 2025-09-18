// Screen Capture Audio Transcription - Universal Content Script

class ScreenCaptureTranscription {
    constructor() {
        this.isCapturing = false;
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.mediaRecorder = null;
        this.websocket = null;
        this.backendUrl = 'http://localhost:8000';
        this.meetingId = null;
        this.transcriptBuffer = [];
        this.summaryBuffer = [];
        this.wordCount = 0;
        this.overlay = null;
        this.isMuted = false; // Audio capture mute state
        this.pollInterval = null; // For polling fallback when WebSocket fails
        this.lastTranscriptTime = 0; // Track last received transcript
        this.lastProcessTime = 0; // Rate limiting for audio processing
        this.isInitialized = false; // Track initialization status
        
        this.init();
    }
    
    init() {
        console.log('🚀 ScreenCaptureTranscription initializing...');
        
        // Prevent multiple initializations
        if (this.isInitialized) {
            console.log('⚠️ Already initialized, skipping...');
            return;
        }
        
        this.settings = {
            language: 'auto',
            showOverlay: true,
            autoSummary: true
        };
        
        // Disable legacy transcription functionality
        this.disableLegacyTranscription();
        
        // Setup message listener
        this.setupMessageListener();
        
        // Generate unique meeting ID
        this.meetingId = `screen_capture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.isInitialized = true;
        console.log('✅ Screen capture transcription ready');
    }
    
    disableLegacyTranscription() {
        // Prevent common.js transcription from interfering
        if (window.meetingTranscription) {
            console.log('🔄 Disabling legacy transcription for screen capture mode');
            window.meetingTranscription.isActive = false;
        }
        
        // Set flag to indicate screen capture is available
        window.screenCaptureAvailable = true;
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Received message:', message);
            
            switch (message.action) {
                case 'PING':
                    // Simple ping to check if content script is loaded
                    sendResponse({ success: true, status: 'content_script_ready' });
                    break;
                    
                case 'START_SCREEN_CAPTURE':
                    // Instead of directly starting, show a button for user gesture
                    this.showScreenCaptureButton(message.settings)
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true; // Keep message channel open for async response
                    
                case 'STOP_SCREEN_CAPTURE':
                    this.stopScreenCapture()
                        .then(() => sendResponse({ success: true }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                    
                case 'GET_TRANSCRIPT':
                    sendResponse({
                        transcript: this.transcriptBuffer.join(' '),
                        summary: this.summaryBuffer.length > 0 ? this.summaryBuffer[this.summaryBuffer.length - 1] : null,
                        wordCount: this.wordCount
                    });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        });
    }
    
    async showScreenCaptureButton(settings = {}) {
        return new Promise((resolve, reject) => {
            // Remove any existing button
            const existingButton = document.getElementById('screen-capture-trigger');
            if (existingButton) {
                existingButton.remove();
            }
            
            // Create trigger button for user gesture
            const buttonContainer = document.createElement('div');
            buttonContainer.id = 'screen-capture-trigger';
            buttonContainer.innerHTML = `
                <div class="capture-trigger-overlay">
                    <div class="capture-trigger-content">
                        <div class="trigger-header">
                            <span class="trigger-icon">🎬</span>
                            <h3>Start Screen Capture</h3>
                        </div>
                        <div class="trigger-body">
                            <p>Click the button below to start screen capture with audio transcription.</p>
                            <div class="trigger-instructions">
                                <div class="instruction-item">
                                    <span class="step-number">1</span>
                                    <span>Select screen or window to share</span>
                                </div>
                                <div class="instruction-item">
                                    <span class="step-number">2</span>
                                    <span><strong>Enable "Share audio"</strong> checkbox</span>
                                </div>
                                <div class="instruction-item">
                                    <span class="step-number">3</span>
                                    <span>Click "Share" to begin transcription</span>
                                </div>
                            </div>
                            <div class="trigger-actions">
                                <button id="start-capture-btn" class="capture-btn primary">
                                    🎤 Start Screen Capture
                                </button>
                                <button id="cancel-capture-btn" class="capture-btn secondary">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Add styles
            const style = document.createElement('style');
            style.textContent = `
                #screen-capture-trigger {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.9);
                    z-index: 999999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'Segoe UI', system-ui, sans-serif;
                    animation: fadeIn 0.3s ease-out;
                }
                
                .capture-trigger-overlay .capture-trigger-content {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 32px;
                    border-radius: 16px;
                    max-width: 500px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
                    color: white;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                
                .trigger-header {
                    margin-bottom: 24px;
                }
                
                .trigger-icon {
                    font-size: 32px;
                    display: block;
                    margin-bottom: 12px;
                }
                
                .trigger-header h3 {
                    font-size: 24px;
                    margin: 0;
                    font-weight: 600;
                }
                
                .trigger-body p {
                    font-size: 16px;
                    margin-bottom: 24px;
                    opacity: 0.9;
                }
                
                .trigger-instructions {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 24px;
                    text-align: left;
                }
                
                .instruction-item {
                    display: flex;
                    align-items: center;
                    margin-bottom: 12px;
                    font-size: 14px;
                }
                
                .instruction-item:last-child {
                    margin-bottom: 0;
                }
                
                .step-number {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 12px;
                    font-weight: 600;
                    font-size: 12px;
                }
                
                .trigger-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                }
                
                .capture-btn {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .capture-btn.primary {
                    background: rgba(255, 255, 255, 0.9);
                    color: #667eea;
                }
                
                .capture-btn.primary:hover {
                    background: white;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }
                
                .capture-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }
                
                .capture-btn.secondary:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
                
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `;
            
            document.head.appendChild(style);
            document.body.appendChild(buttonContainer);
            
            // Add event listeners
            document.getElementById('start-capture-btn').addEventListener('click', async () => {
                try {
                    buttonContainer.remove();
                    
                    // Show loading state
                    console.log('🎬 User clicked start capture, requesting permissions...');
                    
                    await this.startScreenCapture(settings);
                    resolve();
                } catch (error) {
                    console.error('❌ Screen capture initiation failed:', error);
                    
                    // Show error to user
                    this.showErrorMessage(error.message);
                    reject(error);
                }
            });
            
            document.getElementById('cancel-capture-btn').addEventListener('click', () => {
                buttonContainer.remove();
                reject(new Error('User cancelled screen capture'));
            });
            
            // Auto-cancel after 30 seconds
            setTimeout(() => {
                if (buttonContainer.parentNode) {
                    buttonContainer.remove();
                    reject(new Error('Screen capture request timed out'));
                }
            }, 30000);
        });
    }
    
    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #dc3545;
                color: white;
                padding: 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 999999;
                font-family: system-ui;
                max-width: 350px;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">❌</span>
                    <span style="font-weight: 600;">Screen Capture Failed</span>
                </div>
                <div style="margin-top: 8px; font-size: 14px;">
                    ${message}
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    background: none;
                    border: none;
                    color: white;
                    cursor: pointer;
                    font-size: 16px;
                ">✕</button>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 8000);
    }
    
    async startScreenCapture(settings = {}) {
        try {
            console.log('🚀 Starting screen capture with audio...');
            
            // Update settings
            this.settings = { ...this.settings, ...settings };
            this.backendUrl = settings.backendUrl || this.backendUrl;
            
            // Show user instruction for screen capture
            this.showScreenCaptureInstructions();
            
            // Request screen capture with audio - this MUST be called from user gesture
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    mediaSource: 'screen',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });
            
            console.log('✅ Screen capture stream acquired');
            
            // Check if audio track is available
            const audioTracks = this.mediaStream.getAudioTracks();
            if (audioTracks.length === 0) {
                console.warn('⚠️ No system audio track found. This may happen when audio is playing through earbuds/headphones.');
                
                // Try to get microphone audio as fallback
                try {
                    console.log('🎤 Attempting to use microphone as audio source...');
                    const micStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                            sampleRate: 16000,
                            channelCount: 1
                        }
                    });
                    
                    // Add microphone audio track to the existing stream
                    const micAudioTrack = micStream.getAudioTracks()[0];
                    this.mediaStream.addTrack(micAudioTrack);
                    console.log('✅ Microphone audio added as fallback');
                    
                } catch (micError) {
                    console.error('❌ Failed to get microphone audio:', micError);
                    throw new Error('No audio source available. Please ensure system audio is shared or microphone is accessible.');
                }
                
                // Try to get microphone audio as fallback
                const fallbackSuccessful = await this.setupMicrophoneFallback();
                if (!fallbackSuccessful) {
                    this.showAudioCaptureGuidance();
                    return;
                }
            } else {
                console.log('🎵 System audio track found:', audioTracks[0].label);
            }
            
            // Setup audio processing
            await this.setupAudioProcessing();
            
            // Connect to backend
            await this.connectToBackend();
            
            // Show overlay if enabled
            if (this.settings.showOverlay) {
                this.createTranscriptionOverlay();
            }
            
            // Start session with backend
            await this.startMeetingSession();
            
            this.isCapturing = true;
            console.log('🎬 Screen capture started successfully');
            
            // Handle stream ending
            this.mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
                console.log('📺 Screen sharing ended by user');
                this.stopScreenCapture();
            });
            
        } catch (error) {
            console.error('❌ Screen capture failed:', error);
            await this.cleanup();
            throw error;
        }
    }
    
    showScreenCaptureInstructions() {
        // Show instructions popup for screen capture
        const instructionDiv = document.createElement('div');
        instructionDiv.id = 'screen-capture-instructions';
        instructionDiv.innerHTML = `
            <div class="instruction-overlay">
                <div class="instruction-content">
                    <h3>🎬 Screen Capture & Audio Setup</h3>
                    <p><strong>Important:</strong> To capture meeting audio, follow these steps:</p>
                    <ol>
                        <li>Select the screen or window to capture</li>
                        <li><strong>✅ Check "Share audio"</strong> in the screen share dialog</li>
                        <li>For best results: <strong>Use speakers</strong> (not headphones/earbuds)</li>
                        <li>Click "Share" to start transcription</li>
                    </ol>
                    <div class="instruction-note">
                        <p>📝 <strong>Note:</strong> If system audio isn't available, microphone will be used as fallback</p>
                    </div>
                    <div class="instruction-image">
                        📺 → 🔊 → 🎤 → ▶️
                    </div>
                </div>
            </div>
        `;
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            #screen-capture-instructions {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Segoe UI', system-ui, sans-serif;
            }
            
            .instruction-overlay .instruction-content {
                background: white;
                padding: 24px;
                border-radius: 12px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            }
            
            .instruction-overlay h3 {
                color: #333;
                margin-bottom: 16px;
                font-size: 18px;
            }
            
            .instruction-overlay p {
                color: #666;
                margin-bottom: 12px;
            }
            
            .instruction-overlay ol {
                text-align: left;
                color: #333;
                margin-bottom: 16px;
            }
            
            .instruction-overlay li {
                margin-bottom: 8px;
            }
            
            .instruction-image {
                font-size: 24px;
                margin-top: 16px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(instructionDiv);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (instructionDiv.parentNode) {
                instructionDiv.remove();
            }
        }, 5000);
    }
    
    async setupAudioProcessing() {
        try {
            // Create audio context
            this.audioContext = new AudioContext({
                sampleRate: 16000,
                latencyHint: 'interactive'
            });
            
            // Create media stream source
            const mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Initialize audio buffer for collecting 4-5 second chunks
            this.audioBuffer = [];
            this.sampleRate = this.audioContext.sampleRate;
            this.targetBufferDuration = 4.5; // 4.5 seconds
            this.targetBufferSize = Math.floor(this.sampleRate * this.targetBufferDuration);
            
            // Check if AudioWorklet is available
            if (this.audioContext.audioWorklet) {
                console.log('🎛️ Using AudioWorkletNode (modern approach)');
                
                // Register the audio worklet processor
                try {
                    // Create a blob with the worklet processor code
                    const workletCode = `
                        class AudioCaptureProcessor extends AudioWorkletProcessor {
                            constructor() {
                                super();
                                this.port.onmessage = (event) => {
                                    // Handle messages from main thread if needed
                                };
                            }
                            
                            process(inputs, outputs, parameters) {
                                const input = inputs[0];
                                if (input.length > 0 && input[0].length > 0) {
                                    // Send audio data to main thread
                                    this.port.postMessage({
                                        audioData: input[0]
                                    });
                                }
                                return true;
                            }
                        }
                        
                        registerProcessor('audio-capture-processor', AudioCaptureProcessor);
                    `;
                    
                    const workletBlob = new Blob([workletCode], { type: 'application/javascript' });
                    const workletUrl = URL.createObjectURL(workletBlob);
                    
                    await this.audioContext.audioWorklet.addModule(workletUrl);
                    
                    // Create AudioWorkletNode
                    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');
                    
                    // Process audio chunks from worklet
                    this.workletNode.port.onmessage = (event) => {
                        if (this.isCapturing && !this.isMuted) {
                            const audioData = event.data.audioData;
                            this.bufferAudioData(audioData);
                        }
                    };
                    
                    // Connect audio pipeline
                    mediaStreamSource.connect(this.workletNode);
                    this.workletNode.connect(this.audioContext.destination);
                    
                    console.log('🎛️ AudioWorkletNode setup complete');
                } catch (workletError) {
                    console.warn('⚠️ AudioWorklet setup failed, falling back to ScriptProcessorNode:', workletError);
                    this.setupScriptProcessorFallback(mediaStreamSource);
                }
            } else {
                console.log('🎛️ AudioWorklet not available, using ScriptProcessorNode (deprecated but functional)');
                this.setupScriptProcessorFallback(mediaStreamSource);
            }
            
            console.log('🎛️ Audio processing pipeline setup complete');
            
        } catch (error) {
            console.error('❌ Audio processing setup failed:', error);
            throw error;
        }
    }
    
    setupScriptProcessorFallback(mediaStreamSource) {
        // Note: Using ScriptProcessorNode (deprecated but widely supported)
        console.log('🔄 Using ScriptProcessorNode fallback');
        
        // Create script processor for real-time audio chunks
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        // Process audio chunks
        this.processor.onaudioprocess = (event) => {
            if (this.isCapturing && !this.isMuted) {
                const audioData = event.inputBuffer.getChannelData(0);
                this.bufferAudioData(audioData);
            }
        };
        
        // Connect audio pipeline
        mediaStreamSource.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }
    
    async connectToBackend() {
        try {
            console.log('🌐 Connecting to backend...', this.backendUrl);
            
            // Use background script to test backend connection (content scripts can't access external URLs directly)
            const response = await chrome.runtime.sendMessage({
                action: 'TEST_BACKEND_CONNECTION',
                backendUrl: this.backendUrl
            });
            
            if (!response || !response.success) {
                throw new Error(response?.error || 'Backend connection test failed');
            }
            
            console.log('✅ Backend health check passed');
            
            // Show connection status in overlay
            this.showConnectionStatus('✅ Connected to backend');
            
            // Setup WebSocket connection for real-time updates (optional)
            this.setupWebSocketConnection();
            
            console.log('✅ Backend connection established');
            
        } catch (error) {
            console.error('❌ Backend connection failed:', error);
            console.error('❌ Backend URL:', this.backendUrl);
            console.error('❌ Meeting ID:', this.meetingId);
            throw error;
        }
    }
    
    async setupWebSocketConnection() {
        try {
            const wsUrl = this.backendUrl.replace('http://', 'ws://').replace('https://', 'wss://') + `/ws/meeting/${this.meetingId}`;
            console.log('🔌 Attempting WebSocket connection:', wsUrl);
            
            // Test if WebSocket is available
            if (typeof WebSocket === 'undefined') {
                console.error('❌ WebSocket not available in this environment');
                this.startTranscriptPolling();
                return;
            }
            
            this.websocket = new WebSocket(wsUrl);
            
            // Set up WebSocket event handlers
            this.websocket.onopen = () => {
                console.log('🔗 WebSocket connected successfully');
                // Stop polling if it was running
                this.stopTranscriptPolling();
                
                // Send success message to popup
                chrome.runtime.sendMessage({
                    action: 'WEBSOCKET_CONNECTED',
                    meetingId: this.meetingId
                });
                
                // Show connection confirmation in overlay
                this.showConnectionStatus('✅ Connected to backend - Real-time transcription active');
                
                // Send a test message
                this.websocket.send(JSON.stringify({
                    type: 'test',
                    message: 'Connection test from extension'
                }));
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('❌ WebSocket message parse error:', error);
                }
            };
            
            this.websocket.onerror = (error) => {
                console.warn('⚠️ WebSocket connection failed (continuing without real-time updates):', error);
                console.log('🔍 WebSocket error details:', {
                    readyState: this.websocket?.readyState,
                    url: wsUrl,
                    error: error
                });
                // Start polling fallback immediately
                this.startTranscriptPolling();
            };
            
            this.websocket.onclose = (event) => {
                console.log('🔌 WebSocket disconnected', event.code, event.reason);
                console.log('🔍 WebSocket close details:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                });
                
                // Start polling fallback
                this.startTranscriptPolling();
                
                // Try to reconnect if it wasn't a clean close and we're still capturing
                if (event.code !== 1000 && event.code !== 1001 && this.isCapturing) {
                    console.log('🔄 Attempting to reconnect WebSocket in 10 seconds...');
                    setTimeout(() => {
                        if (this.isCapturing && !this.pollInterval) {
                            this.setupWebSocketConnection();
                        }
                    }, 10000); // Increased to 10 seconds
                }
            };
            
        } catch (error) {
            console.warn('⚠️ WebSocket setup failed (continuing without real-time updates):', error);
            this.startTranscriptPolling();
        }
    }

    async startMeetingSession() {
        try {
            // Use background script to start meeting session
            const response = await chrome.runtime.sendMessage({
                action: 'START_MEETING_SESSION',
                backendUrl: this.backendUrl,
                meetingId: this.meetingId,
                participants: ['Screen Capture User']
            });
            
            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to start meeting session');
            }
            
            console.log('📋 Meeting session started');
            
        } catch (error) {
            console.error('❌ Failed to start meeting session:', error);
            throw error;
        }
    }
    
    bufferAudioData(audioData) {
        // Skip if muted
        if (this.isMuted) {
            return;
        }
        
        // Add new audio data to buffer
        this.audioBuffer.push(...audioData);
        
        // If buffer has enough data (4.5 seconds), process it
        if (this.audioBuffer.length >= this.targetBufferSize) {
            // Extract chunk for processing
            const chunkData = new Float32Array(this.audioBuffer.slice(0, this.targetBufferSize));
            
            // Process this chunk asynchronously without blocking
            this.processAudioChunk(chunkData).catch(error => {
                console.error('❌ Audio chunk processing failed:', error);
            });
            
            // Remove processed data from buffer (keep some overlap for continuity)
            const overlapSize = Math.floor(this.sampleRate * 0.5); // 0.5 second overlap
            this.audioBuffer = this.audioBuffer.slice(this.targetBufferSize - overlapSize);
        }
    }

    async processAudioChunk(audioData) {
        try {
            // Rate limiting - don't process chunks too frequently
            const now = Date.now();
            if (now - this.lastProcessTime < 2000) { // Minimum 2 seconds between chunks
                console.log('🔄 Skipping chunk - rate limited');
                return;
            }
            this.lastProcessTime = now;
            
            // Convert Float32Array to PCM16
            const pcmData = this.float32ToPcm16(audioData);
            
            // Log information about the audio data
            console.log('🎵 Audio chunk info:', {
                originalSize: audioData.length,
                pcmSize: pcmData.byteLength,
                sampleRate: this.sampleRate,
                duration: audioData.length / this.sampleRate
            });
            
            // Create blob for upload
            const blob = new Blob([pcmData], { type: 'audio/pcm' });
            
            // Convert blob to base64 for message passing - use safer method for large arrays
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Log information about the data being sent
            console.log('📤 Sending audio chunk:', {
                blobSize: blob.size,
                arraySize: uint8Array.length,
                firstBytes: Array.from(uint8Array.slice(0, 10))
            });
            
            // Avoid stack overflow from spread operator on large arrays
            let binaryString = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binaryString += String.fromCharCode(uint8Array[i]);
            }
            const base64Data = btoa(binaryString);
            
            // Send to backend via background script - enforce English only
            const response = await chrome.runtime.sendMessage({
                action: 'PROCESS_AUDIO_CHUNK',
                backendUrl: this.backendUrl,
                meetingId: this.meetingId,
                audioData: base64Data,
                language: 'en'  // Force English only
            });
            
            if (response && response.success) {
                // Results will come via WebSocket for real-time updates
                console.log('🎵 Audio chunk processed successfully');
                
                // If WebSocket is not connected, show processing status in overlay
                if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
                    this.showTranscriptionStatus('📤 Audio sent for processing...');
                }
            } else {
                console.warn('⚠️ Audio chunk processing response:', response);
            }
            
        } catch (error) {
            console.error('❌ Audio chunk processing failed:', error);
        }
    }
    
    float32ToPcm16(float32Array) {
        // Ensure the array is not too large to avoid memory issues
        const maxLength = 1000000; // 1 million samples max
        if (float32Array.length > maxLength) {
            float32Array = float32Array.slice(0, maxLength);
            console.warn('🎵 Audio chunk truncated to prevent memory issues');
        }
        
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }
        return pcm16.buffer;
    }
    
    handleWebSocketMessage(data) {
        console.log('📨 WebSocket message:', data);
        
        switch (data.type) {
            case 'transcription':
                this.handleTranscription(data);
                break;
                
            case 'summary':
                this.handleSummary(data);
                break;
                
            case 'progress':
                this.handleProgress(data);
                break;
                
            case 'session_start':
                console.log('📋 Session started:', data);
                break;
                
            default:
                console.log('📝 Unknown message type:', data.type);
        }
    }
    
    handleTranscription(data) {
        if (data.text && data.text.trim()) {
            console.log('🗣️ New transcription:', data.text);
            
            // Add to transcript buffer
            this.transcriptBuffer.push(data.text);
            
            // Update word count
            this.wordCount += data.text.split(' ').length;
            
            // Update overlay
            if (this.overlay) {
                this.updateOverlayTranscription(data.text);
            }
            
            // Notify popup
            this.notifyPopup('TRANSCRIPT_UPDATE', { wordCount: this.wordCount });
        }
    }
    
    handleSummary(data) {
        console.log('📊 New summary:', data);
        
        if (data.data) {
            this.summaryBuffer.push(data.data);
            
            // Update overlay with summary
            if (this.overlay) {
                this.updateOverlaySummary(data.data);
            }
        }
    }
    
    handleProgress(data) {
        console.log('⏳ Progress update:', data.message);
        
        if (this.overlay) {
            this.updateOverlayStatus(data.message);
        }
        
        // Notify popup
        this.notifyPopup('CAPTURE_STATUS', { status: data.message });
    }
    
    createTranscriptionOverlay() {
        // Remove existing overlay
        if (this.overlay) {
            this.overlay.remove();
        }
        
        // Create overlay container
        this.overlay = document.createElement('div');
        this.overlay.id = 'ai-transcription-overlay';
        this.overlay.innerHTML = `
            <div class="overlay-header">
                <div class="overlay-title">
                    <span class="overlay-icon">🎤</span>
                    <span class="overlay-text">AI Live Transcription</span>
                </div>
                <div class="overlay-controls">
                    <button id="overlay-mute" class="overlay-btn" title="Mute/Unmute audio capture">🎤</button>
                    <button id="overlay-minimize" class="overlay-btn">−</button>
                    <button id="overlay-close" class="overlay-btn">✕</button>
                </div>
            </div>
            <div class="overlay-content">
                <div class="transcription-section">
                    <h3>📝 Live Transcription</h3>
                    <div id="transcription-text" class="transcription-text">Waiting for audio...</div>
                </div>
                <div class="summary-section">
                    <h3>🔑 Key Points</h3>
                    <div id="summary-content" class="summary-content">No summary yet...</div>
                </div>
                <div class="overlay-stats">
                    <span id="overlay-status" class="status-item">Ready</span>
                    <span class="separator">•</span>
                    <span id="overlay-words" class="status-item">Words: 0</span>
                    <span class="separator">•</span>
                    <span id="overlay-time" class="status-item">00:00</span>
                </div>
            </div>
        `;
        
        // Apply styles
        this.overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 450px;
            max-height: 600px;
            background: rgba(0, 0, 0, 0.95);
            backdrop-filter: blur(15px);
            color: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            font-family: 'Segoe UI', system-ui, sans-serif;
            border: 1px solid rgba(255, 255, 255, 0.1);
            resize: both;
            overflow: hidden;
            transition: all 0.3s ease;
        `;
        
        // Add detailed styles
        const style = document.createElement('style');
        style.textContent = `
            #ai-transcription-overlay .overlay-header {
                padding: 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                background: rgba(255, 255, 255, 0.05);
            }
            
            #ai-transcription-overlay .overlay-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                font-size: 14px;
            }
            
            #ai-transcription-overlay .overlay-icon {
                font-size: 16px;
            }
            
            #ai-transcription-overlay .overlay-controls {
                display: flex;
                gap: 4px;
            }
            
            #ai-transcription-overlay .overlay-btn {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: white;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            #ai-transcription-overlay .overlay-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                border-color: rgba(255, 255, 255, 0.4);
                transform: scale(1.05);
            }
            
            #ai-transcription-overlay #overlay-close {
                background: rgba(220, 53, 69, 0.8);
                border-color: rgba(220, 53, 69, 1);
            }
            
            #ai-transcription-overlay #overlay-close:hover {
                background: rgba(220, 53, 69, 1);
                border-color: rgba(255, 255, 255, 0.4);
            }
            
            #ai-transcription-overlay .overlay-content {
                padding: 16px;
                max-height: 500px;
                overflow-y: auto;
            }
            
            #ai-transcription-overlay .transcription-section,
            #ai-transcription-overlay .summary-section {
                margin-bottom: 20px;
            }
            
            #ai-transcription-overlay h3 {
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 8px;
                color: rgba(255, 255, 255, 0.8);
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            #ai-transcription-overlay .transcription-text {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 12px;
                font-size: 13px;
                line-height: 1.5;
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            #ai-transcription-overlay .summary-content {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 12px;
                font-size: 12px;
                line-height: 1.4;
                max-height: 150px;
                overflow-y: auto;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            #ai-transcription-overlay .overlay-stats {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                color: rgba(255, 255, 255, 0.6);
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            #ai-transcription-overlay .status-item {
                color: rgba(255, 255, 255, 0.8);
            }
            
            #ai-transcription-overlay .separator {
                opacity: 0.5;
            }
            
            #ai-transcription-overlay.minimized .overlay-content {
                display: none;
            }
            
            #ai-transcription-overlay.minimized {
                max-height: 56px;
            }
            
            #ai-transcription-overlay .overlay-content::-webkit-scrollbar {
                width: 4px;
            }
            
            #ai-transcription-overlay .overlay-content::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
            }
            
            #ai-transcription-overlay .overlay-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 2px;
            }
            
            #ai-transcription-overlay .transcription-text::-webkit-scrollbar,
            #ai-transcription-overlay .summary-content::-webkit-scrollbar {
                width: 3px;
            }
            
            #ai-transcription-overlay .transcription-text::-webkit-scrollbar-thumb,
            #ai-transcription-overlay .summary-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 2px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.overlay);
        
        // Setup overlay controls
        this.setupOverlayControls();
        this.makeDraggable();
        
        // Start time counter
        this.startTimeCounter();
        
        console.log('📺 Transcription overlay created');
    }
    
    setupOverlayControls() {
        const minimizeBtn = document.getElementById('overlay-minimize');
        const closeBtn = document.getElementById('overlay-close');
        const muteBtn = document.getElementById('overlay-mute');
        
        console.log('🔧 Setting up overlay controls...');
        console.log('Close button found:', closeBtn);
        console.log('Minimize button found:', minimizeBtn);
        console.log('Mute button found:', muteBtn);
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => {
                this.overlay.classList.toggle('minimized');
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                console.log('❌ Close button clicked');
                this.stopScreenCapture();
            });
            // Make close button more prominent
            closeBtn.style.cssText += `
                background: rgba(220, 53, 69, 0.9) !important;
                font-weight: bold !important;
                font-size: 16px !important;
            `;
        }
        
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.toggleMute();
            });
        }
        
        // Add keyboard shortcut (Escape key to close)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isCapturing && this.overlay) {
                console.log('⌨️ Escape key pressed - closing overlay');
                this.stopScreenCapture();
            }
        });
        
        // Add emergency close on double-click header
        const header = this.overlay.querySelector('.overlay-header');
        if (header) {
            header.addEventListener('dblclick', () => {
                console.log('🚨 Emergency close - double-clicked header');
                this.stopScreenCapture();
            });
        }
    }
    
    makeDraggable() {
        const header = this.overlay.querySelector('.overlay-header');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragOffset.x = e.clientX - this.overlay.offsetLeft;
            dragOffset.y = e.clientY - this.overlay.offsetTop;
            header.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const x = e.clientX - dragOffset.x;
                const y = e.clientY - dragOffset.y;
                
                this.overlay.style.left = `${x}px`;
                this.overlay.style.top = `${y}px`;
                this.overlay.style.right = 'auto';
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            header.style.cursor = 'move';
        });
    }
    
    startTimeCounter() {
        const startTime = Date.now();
        
        this.timeCounter = setInterval(() => {
            if (this.isCapturing) {
                const elapsed = Date.now() - startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                const timeElement = document.getElementById('overlay-time');
                if (timeElement) {
                    timeElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                }
            }
        }, 1000);
    }
    
    updateOverlayTranscription(text) {
        const transcriptionElement = document.getElementById('transcription-text');
        if (transcriptionElement) {
            // Add new text with timestamp
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const newEntry = `[${timestamp}] ${text}`;
            
            if (transcriptionElement.textContent === 'Waiting for audio...') {
                transcriptionElement.textContent = newEntry;
            } else {
                transcriptionElement.textContent += '\n' + newEntry;
            }
            
            // Auto-scroll to bottom
            transcriptionElement.scrollTop = transcriptionElement.scrollHeight;
            
            // Update word count
            const wordsElement = document.getElementById('overlay-words');
            if (wordsElement) {
                wordsElement.textContent = `Words: ${this.wordCount}`;
            }
        }
    }
    
    updateOverlaySummary(summary) {
        const summaryElement = document.getElementById('summary-content');
        if (summaryElement) {
            let summaryText = '';
            
            if (summary.summary) {
                summaryText += `📝 ${summary.summary}\n\n`;
            }
            
            if (summary.key_points && summary.key_points.length > 0) {
                summaryText += '🔑 Key Points:\n';
                summary.key_points.forEach((point, index) => {
                    summaryText += `${index + 1}. ${point}\n`;
                });
                summaryText += '\n';
            }
            
            if (summary.action_items && summary.action_items.length > 0) {
                summaryText += '✅ Action Items:\n';
                summary.action_items.forEach((item, index) => {
                    summaryText += `${index + 1}. ${item}\n`;
                });
            }
            
            summaryElement.textContent = summaryText || 'No summary yet...';
            summaryElement.scrollTop = summaryElement.scrollHeight;
        }
    }
    
    updateOverlayStatus(status) {
        const statusElement = document.getElementById('overlay-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }
    
    notifyPopup(type, data) {
        try {
            chrome.runtime.sendMessage({ type, ...data });
        } catch (error) {
            // Popup might be closed, ignore error
        }
    }
    
    async setupMicrophoneFallback() {
        try {
            console.log('🎙️ System audio not available. Trying microphone fallback...');
            
            // Request microphone access
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });
            
            console.log('✅ Microphone audio track acquired');
            
            // Combine screen video with microphone audio
            const videoTracks = this.mediaStream.getVideoTracks();
            const audioTracks = micStream.getAudioTracks();
            
            // Create new media stream with video from screen and audio from microphone
            this.mediaStream = new MediaStream([...videoTracks, ...audioTracks]);
            
            // Show notification that we're using microphone
            this.showMicrophoneNotification();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to setup microphone fallback:', error);
            return false;
        }
    }
    
    showMicrophoneNotification() {
        const notification = document.createElement('div');
        notification.className = 'microphone-notification';
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">🎙️</span>
                <div class="notification-text">
                    <strong>Using Microphone Audio</strong>
                    <p>System audio not available (likely using earbuds/headphones). 
                    Microphone will capture your voice and nearby sounds.</p>
                </div>
                <button id="mic-notification-ok" class="notification-btn">Got it</button>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(33, 37, 41, 0.95);
            backdrop-filter: blur(15px);
            color: white;
            padding: 20px;
            border-radius: 12px;
            z-index: 10001;
            max-width: 400px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds or when button clicked
        const removeNotification = () => {
            if (notification.parentNode) {
                notification.remove();
            }
        };
        
        document.getElementById('mic-notification-ok').addEventListener('click', removeNotification);
        setTimeout(removeNotification, 5000);
    }
    
    showAudioCaptureGuidance() {
        const guidance = document.createElement('div');
        guidance.className = 'audio-capture-guidance';
        guidance.innerHTML = `
            <div class="guidance-content">
                <span class="guidance-icon">🔊</span>
                <div class="guidance-text">
                    <h3>Audio Capture Setup</h3>
                    <p>To capture system audio, try these steps:</p>
                    <ol>
                        <li>Switch from earbuds/headphones to speakers</li>
                        <li>When sharing screen, check "Share audio" checkbox</li>
                        <li>Or use microphone to capture your voice</li>
                    </ol>
                </div>
                <div class="guidance-buttons">
                    <button id="try-mic-btn" class="guidance-btn primary">Try Microphone</button>
                    <button id="guidance-cancel" class="guidance-btn">Cancel</button>
                </div>
            </div>
        `;
        
        guidance.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(33, 37, 41, 0.95);
            backdrop-filter: blur(15px);
            color: white;
            padding: 25px;
            border-radius: 12px;
            z-index: 10001;
            max-width: 450px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;
        
        document.body.appendChild(guidance);
        
        // Handle button clicks
        document.getElementById('try-mic-btn').addEventListener('click', async () => {
            guidance.remove();
            const success = await this.setupMicrophoneFallback();
            if (success) {
                // Continue with the rest of the setup
                await this.setupAudioProcessing();
                await this.connectToBackend();
                if (this.settings.showOverlay) {
                    this.createTranscriptionOverlay();
                }
                await this.startMeetingSession();
                this.isCapturing = true;
                this.updateStatus('Recording...');
                this.notifyPopup('SCREEN_CAPTURE_STARTED');
            }
        });
        
        document.getElementById('guidance-cancel').addEventListener('click', () => {
            guidance.remove();
            this.stopScreenCapture();
        });
    }

    async stopScreenCapture() {
        try {
            console.log('⏹️ Stopping screen capture...');
            
            this.isCapturing = false;
            
            // Stop all tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            
            // Cleanup audio context safely
            if (this.processor) {
                try {
                    this.processor.disconnect();
                } catch (e) {
                    console.warn('⚠️ Processor disconnect error:', e);
                }
            }
            
            if (this.audioContext && this.audioContext.state !== 'closed') {
                try {
                    await this.audioContext.close();
                } catch (e) {
                    console.warn('⚠️ AudioContext close error:', e);
                }
            }
            
            // Close WebSocket
            if (this.websocket) {
                this.websocket.close();
            }
            
            // End meeting session
            await this.endMeetingSession();
            
            // Remove overlay
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            
            // Clear timers
            if (this.timeCounter) {
                clearInterval(this.timeCounter);
            }
            
            // Stop polling
            this.stopTranscriptPolling();
            
            await this.cleanup();
            
            console.log('✅ Screen capture stopped');
            
        } catch (error) {
            console.error('❌ Error stopping screen capture:', error);
        }
    }
    
    async endMeetingSession() {
        try {
            // Use background script to end meeting session
            const response = await chrome.runtime.sendMessage({
                action: 'END_MEETING_SESSION',
                backendUrl: this.backendUrl,
                meetingId: this.meetingId
            });
            
            if (response && response.success) {
                console.log('📋 Meeting session ended');
            } else {
                console.warn('⚠️ End meeting session response:', response);
            }
            
        } catch (error) {
            console.error('❌ Failed to end meeting session:', error);
        }
    }
    
    async cleanup() {
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.websocket = null;
        this.transcriptBuffer = [];
        this.summaryBuffer = [];
        this.wordCount = 0;
        // Clear audio buffer
        this.audioBuffer = [];
    }
    
    showConnectionStatus(message) {
        // Create or update connection status in overlay
        if (this.overlay) {
            let statusEl = this.overlay.querySelector('#connection-status');
            if (!statusEl) {
                statusEl = document.createElement('div');
                statusEl.id = 'connection-status';
                statusEl.style.cssText = `
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 0, 0, 0.8);
                    color: #4CAF50;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 500;
                    z-index: 1000;
                    transition: opacity 0.3s ease;
                `;
                this.overlay.appendChild(statusEl);
            }
            
            statusEl.textContent = message;
            statusEl.style.opacity = '1';
            
            // Auto-hide after 5 seconds for connection messages
            if (message.includes('Connected')) {
                setTimeout(() => {
                    if (statusEl) {
                        statusEl.style.opacity = '0.7';
                    }
                }, 5000);
            }
        }
    }
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        const muteBtn = document.getElementById('overlay-mute');
        const statusEl = document.getElementById('overlay-status');
        
        if (muteBtn) {
            muteBtn.textContent = this.isMuted ? '🔇' : '🎤';
            muteBtn.title = this.isMuted ? 'Unmute audio capture' : 'Mute audio capture';
            muteBtn.style.opacity = this.isMuted ? '0.6' : '1';
        }
        
        if (statusEl) {
            statusEl.textContent = this.isMuted ? 'Muted' : 'Listening';
        }
        
        // Show temporary status message
        this.showConnectionStatus(this.isMuted ? '🔇 Audio capture muted' : '🎤 Audio capture resumed');
        
        console.log(this.isMuted ? '🔇 Audio capture muted' : '🎤 Audio capture resumed');
    }

    startTranscriptPolling() {
        // Don't start multiple polling intervals
        if (this.pollInterval) return;
        
        console.log('🔄 Starting transcript polling fallback...');
        this.showConnectionStatus('🔄 Using polling mode (WebSocket unavailable)');
        
        this.pollInterval = setInterval(() => {
            this.pollForTranscripts();
        }, 3000); // Poll every 3 seconds
    }

    stopTranscriptPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('⏹️ Stopped transcript polling');
        }
    }

    async pollForTranscripts() {
        if (!this.isCapturing || !this.meetingId) return;
        
        try {
            // Poll for recent transcripts (this would need a backend endpoint)
            const response = await chrome.runtime.sendMessage({
                action: 'GET_RECENT_TRANSCRIPTS', 
                backendUrl: this.backendUrl,
                meetingId: this.meetingId,
                since: this.lastTranscriptTime
            });
            
            if (response && response.success && response.transcripts) {
                response.transcripts.forEach(transcript => {
                    this.handleTranscription({
                        text: transcript.text,
                        timestamp: transcript.timestamp
                    });
                    this.lastTranscriptTime = Math.max(this.lastTranscriptTime, transcript.timestamp);
                });
            }
        } catch (error) {
            console.warn('⚠️ Polling failed:', error);
        }
    }

    showTranscriptionStatus(message) {
        // Update the transcription display with status message
        if (this.overlay) {
            const transcriptionText = this.overlay.querySelector('#transcription-text');
            if (transcriptionText) {
                const statusMsg = document.createElement('div');
                statusMsg.style.cssText = `
                    color: #666;
                    font-style: italic;
                    font-size: 0.9em;
                    margin: 5px 0;
                    opacity: 0.8;
                `;
                statusMsg.textContent = message;
                
                // Add to top of transcription area
                transcriptionText.insertBefore(statusMsg, transcriptionText.firstChild);
                
                // Remove after 3 seconds
                setTimeout(() => {
                    if (statusMsg.parentNode) {
                        statusMsg.parentNode.removeChild(statusMsg);
                    }
                }, 3000);
            }
        }
    }
}

// Initialize screen capture transcription with singleton protection
if (!window.screenCaptureTranscription) {
    console.log('🎬 Creating new ScreenCaptureTranscription instance');
    window.screenCaptureTranscription = new ScreenCaptureTranscription();
} else {
    console.log('🔄 ScreenCaptureTranscription already exists, using existing instance');
}