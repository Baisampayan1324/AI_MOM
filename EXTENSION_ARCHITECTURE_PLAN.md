# Browser Extension Architecture Plan
## Real-time Transcription Extension for Google Meet, Zoom, and YouTube

### 🎯 Overview
This browser extension will capture audio from web-based meetings and video content, send it to our optimized backend for real-time transcription and summarization, and display results in an overlay interface.

---

## 📋 Extension Architecture

### 1. **Core Components**

#### **Manifest (manifest.json)**
- Extension metadata and permissions
- Content script registration for target websites
- Background script configuration
- Web accessible resources

#### **Background Script (background.js)**
- WebSocket connection management to backend
- Audio capture coordination
- Cross-tab communication
- Extension lifecycle management

#### **Content Scripts**
- `google-meet.js` - Google Meet integration
- `zoom.js` - Zoom web client integration  
- `youtube.js` - YouTube integration
- `common.js` - Shared functionality

#### **Popup Interface (popup.html)**
- Extension settings and controls
- Session management
- Quick access to features

#### **Overlay Interface**
- Real-time transcription display
- Summary panel
- Settings panel
- Floating/dockable design

### 2. **Audio Capture Strategy**

#### **Method 1: Tab Audio Capture (Recommended)**
```javascript
// Capture audio from active tab
navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: false
}).then(stream => {
    // Process audio stream
});
```

#### **Method 2: System Audio (Alternative)**
- Use Chrome's `tabCapture` API
- Requires additional permissions
- Better compatibility across platforms

#### **Audio Processing Pipeline**
1. **Capture** → Raw audio stream from tab
2. **Chunk** → Split into 1-second segments
3. **Format** → Convert to WebM/MP4 for backend
4. **Send** → Real-time transmission to backend
5. **Receive** → Get transcription and display

### 3. **Platform-Specific Integration**

#### **Google Meet Integration**
```javascript
// google-meet.js
class GoogleMeetIntegration {
    constructor() {
        this.meetingId = this.extractMeetingId();
        this.participants = this.getParticipants();
        this.injectOverlay();
    }

    extractMeetingId() {
        // Extract from URL: meet.google.com/xxx-xxxx-xxx
        return window.location.pathname.split('/').pop();
    }

    getParticipants() {
        // Query DOM for participant names
        return Array.from(document.querySelectorAll('[data-participant-id]'))
            .map(el => el.textContent.trim());
    }

    injectOverlay() {
        // Create floating transcription overlay
        const overlay = this.createTranscriptionOverlay();
        document.body.appendChild(overlay);
    }
}
```

#### **Zoom Integration**
```javascript
// zoom.js
class ZoomIntegration {
    constructor() {
        this.meetingId = this.extractMeetingId();
        this.waitForMeetingStart();
    }

    extractMeetingId() {
        // Extract from URL or page title
        return document.title.match(/\d{9,11}/)?.[0] || 'zoom-meeting';
    }

    waitForMeetingStart() {
        // Wait for meeting interface to load
        const observer = new MutationObserver((mutations) => {
            if (document.querySelector('[aria-label="Mute"]')) {
                this.initializeCapture();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}
```

#### **YouTube Integration**
```javascript
// youtube.js
class YouTubeIntegration {
    constructor() {
        this.videoId = this.extractVideoId();
        this.setupVideoIntegration();
    }

    extractVideoId() {
        const url = new URL(window.location.href);
        return url.searchParams.get('v');
    }

    setupVideoIntegration() {
        // Integrate with YouTube player
        const player = document.querySelector('video');
        if (player) {
            this.injectTranscriptionPanel();
        }
    }
}
```

---

## 🛠️ Implementation Details

### **File Structure**
```
extension/
├── manifest.json
├── background.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/
│   ├── common.js
│   ├── google-meet.js
│   ├── zoom.js
│   └── youtube.js
├── overlay/
│   ├── overlay.html
│   ├── overlay.css
│   └── overlay.js
├── assets/
│   ├── icons/
│   └── styles/
└── utils/
    ├── audio-capture.js
    ├── websocket-client.js
    └── storage.js
```

### **Core Features**

#### **1. Real-time Audio Capture**
- Monitor active tab for audio
- Handle permission requests
- Graceful fallback for unsupported sites

#### **2. Backend Communication**
- WebSocket connection to backend
- Automatic reconnection
- Error handling and retry logic

#### **3. Transcription Overlay**
- Floating, resizable panel
- Real-time text display
- Speaker identification
- Confidence indicators

#### **4. Summary Panel**
- Key points extraction
- Action items highlighting
- Meeting notes export

#### **5. Settings & Configuration**
- Backend server configuration
- Language preferences
- Overlay customization
- Privacy settings

---

## 🔧 Technical Implementation

### **Manifest.json**
```json
{
    "manifest_version": 3,
    "name": "Real-time Meeting Transcription",
    "version": "1.0.0",
    "description": "Real-time transcription for Google Meet, Zoom, and YouTube",
    
    "permissions": [
        "activeTab",
        "tabCapture",
        "storage",
        "scripting"
    ],
    
    "host_permissions": [
        "https://meet.google.com/*",
        "https://*.zoom.us/*",
        "https://www.youtube.com/*"
    ],
    
    "background": {
        "service_worker": "background.js"
    },
    
    "content_scripts": [
        {
            "matches": ["https://meet.google.com/*"],
            "js": ["content/common.js", "content/google-meet.js"],
            "css": ["overlay/overlay.css"]
        },
        {
            "matches": ["https://*.zoom.us/*"],
            "js": ["content/common.js", "content/zoom.js"],
            "css": ["overlay/overlay.css"]
        },
        {
            "matches": ["https://www.youtube.com/*"],
            "js": ["content/common.js", "content/youtube.js"],
            "css": ["overlay/overlay.css"]
        }
    ],
    
    "action": {
        "default_popup": "popup/popup.html",
        "default_title": "Meeting Transcription"
    },
    
    "web_accessible_resources": [
        {
            "resources": ["overlay/*", "assets/*"],
            "matches": ["<all_urls>"]
        }
    ]
}
```

### **Background Script**
```javascript
// background.js
class BackgroundService {
    constructor() {
        this.activeConnections = new Map();
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'START_CAPTURE':
                    this.startAudioCapture(sender.tab.id, message.data);
                    break;
                case 'STOP_CAPTURE':
                    this.stopAudioCapture(sender.tab.id);
                    break;
                case 'WEBSOCKET_MESSAGE':
                    this.handleWebSocketMessage(message.data);
                    break;
            }
        });
    }

    async startAudioCapture(tabId, options) {
        try {
            const stream = await chrome.tabCapture.capture({
                audio: true,
                video: false
            });
            
            this.processAudioStream(stream, tabId, options);
        } catch (error) {
            console.error('Audio capture failed:', error);
        }
    }

    processAudioStream(stream, tabId, options) {
        const mediaRecorder = new MediaRecorder(stream);
        const websocket = new WebSocket(`ws://localhost:8000/ws/meeting/${options.meetingId}`);
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.sendAudioChunk(websocket, event.data, options);
            }
        };
        
        mediaRecorder.start(1000); // 1-second chunks
        
        this.activeConnections.set(tabId, {
            mediaRecorder,
            websocket,
            stream
        });
    }

    sendAudioChunk(websocket, audioBlob, options) {
        const formData = new FormData();
        formData.append('chunk', audioBlob);
        formData.append('meeting_id', options.meetingId);
        formData.append('language', options.language || '');

        // Send via HTTP since WebSocket doesn't support FormData
        fetch('http://localhost:8000/api/process-audio-chunk', {
            method: 'POST',
            body: formData
        }).catch(console.error);
    }
}

new BackgroundService();
```

### **Common Content Script**
```javascript
// content/common.js
class CommonIntegration {
    constructor() {
        this.overlay = null;
        this.websocket = null;
        this.isCapturing = false;
        this.setupMessageListener();
    }

    createTranscriptionOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'meeting-transcription-overlay';
        overlay.innerHTML = `
            <div class="transcription-header">
                <h3>🎤 Live Transcription</h3>
                <div class="controls">
                    <button id="toggleCapture">Start</button>
                    <button id="toggleMinimize">−</button>
                    <button id="closeOverlay">×</button>
                </div>
            </div>
            <div class="transcription-content">
                <div id="transcriptionDisplay">
                    <div class="waiting-message">Click Start to begin transcription...</div>
                </div>
                <div id="summaryPanel" class="hidden">
                    <h4>📊 Summary</h4>
                    <div id="summaryContent"></div>
                </div>
            </div>
        `;
        
        this.setupOverlayEvents(overlay);
        return overlay;
    }

    setupOverlayEvents(overlay) {
        const toggleBtn = overlay.querySelector('#toggleCapture');
        const minimizeBtn = overlay.querySelector('#toggleMinimize');
        const closeBtn = overlay.querySelector('#closeOverlay');

        toggleBtn.addEventListener('click', () => this.toggleCapture());
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());
        closeBtn.addEventListener('click', () => this.closeOverlay());

        // Make draggable
        this.makeDraggable(overlay);
    }

    toggleCapture() {
        if (this.isCapturing) {
            this.stopCapture();
        } else {
            this.startCapture();
        }
    }

    startCapture() {
        const meetingId = this.getMeetingId();
        const language = this.getPreferredLanguage();

        chrome.runtime.sendMessage({
            type: 'START_CAPTURE',
            data: { meetingId, language }
        });

        this.connectWebSocket(meetingId);
        this.isCapturing = true;
        this.updateCaptureButton('Stop');
    }

    stopCapture() {
        chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
        
        if (this.websocket) {
            this.websocket.close();
        }
        
        this.isCapturing = false;
        this.updateCaptureButton('Start');
    }

    connectWebSocket(meetingId) {
        this.websocket = new WebSocket(`ws://localhost:8000/ws/meeting/${meetingId}`);
        
        this.websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleTranscriptionUpdate(data);
        };
    }

    handleTranscriptionUpdate(data) {
        switch (data.type) {
            case 'transcription':
                this.addTranscriptionText(data.text, data.timestamp);
                break;
            case 'summary':
                this.updateSummary(data.data);
                break;
        }
    }

    addTranscriptionText(text, timestamp) {
        const display = document.getElementById('transcriptionDisplay');
        const item = document.createElement('div');
        item.className = 'transcription-item';
        
        const time = new Date(timestamp * 1000).toLocaleTimeString();
        item.innerHTML = `
            <span class="timestamp">${time}</span>
            <span class="text">${this.escapeHtml(text)}</span>
        `;
        
        display.appendChild(item);
        display.scrollTop = display.scrollHeight;
    }

    updateSummary(summaryData) {
        const panel = document.getElementById('summaryPanel');
        const content = document.getElementById('summaryContent');
        
        content.innerHTML = `
            <div class="summary-text">${summaryData.summary}</div>
            <div class="key-points">
                <h5>Key Points:</h5>
                <ul>${summaryData.key_points.map(point => `<li>${point}</li>`).join('')}</ul>
            </div>
            <div class="action-items">
                <h5>Action Items:</h5>
                <ul>${summaryData.action_items.map(item => `<li>${item}</li>`).join('')}</ul>
            </div>
        `;
        
        panel.classList.remove('hidden');
    }

    makeDraggable(element) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        const header = element.querySelector('.transcription-header');
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = element.offsetLeft;
            startTop = element.offsetTop;
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            element.style.left = (startLeft + deltaX) + 'px';
            element.style.top = (startTop + deltaY) + 'px';
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    // Platform-specific implementations should override these
    getMeetingId() { return 'unknown-meeting'; }
    getPreferredLanguage() { return 'en'; }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

---

## 🎨 UI/UX Design

### **Overlay Interface Features**
- **Floating Panel**: Draggable, resizable transcription window
- **Minimizable**: Collapse to small indicator when not needed
- **Theme Integration**: Match Google Meet/Zoom color schemes
- **Accessibility**: Screen reader compatible, keyboard navigation

### **Visual Elements**
- Real-time typing indicator
- Speaker color coding
- Confidence level indicators
- Connection status indicator
- Processing time display

---

## 🔒 Privacy & Security

### **Data Handling**
- Local audio processing where possible
- Encrypted WebSocket connections
- No audio storage by default
- User consent for all operations

### **Permissions**
- Minimal required permissions
- Clear permission explanations
- Option to disable on specific sites

---

## 📦 Deployment Strategy

### **Development Phases**

#### **Phase 1: Core Infrastructure**
- Basic extension structure
- Audio capture implementation
- Backend communication

#### **Phase 2: Platform Integration**
- Google Meet integration
- Basic transcription overlay
- Settings panel

#### **Phase 3: Advanced Features**
- Zoom and YouTube support
- Summary generation
- Export functionality

#### **Phase 4: Polish & Optimization**
- Performance improvements
- UI/UX refinements
- Extensive testing

### **Distribution**
- Chrome Web Store publication
- Firefox Add-on store (with manifest v2 version)
- Enterprise deployment options

---

## 🧪 Testing Strategy

### **Test Scenarios**
1. **Google Meet**: Join meeting, start transcription, verify accuracy
2. **Zoom**: Web client integration, audio capture quality
3. **YouTube**: Video transcription, sync with playback
4. **Performance**: Memory usage, CPU impact, battery drain
5. **Edge Cases**: Poor connection, permission denied, audio failures

### **Quality Assurance**
- Automated testing for core functions
- Manual testing across browsers
- User acceptance testing
- Accessibility compliance testing

---

## 📊 Success Metrics

### **Technical Metrics**
- Transcription accuracy: >90%
- Latency: <2 seconds
- Memory usage: <50MB
- CPU impact: <10%

### **User Experience Metrics**
- Setup time: <2 minutes
- User retention: >80%
- Error rate: <5%
- User satisfaction: >4.5/5

---

This comprehensive plan provides a roadmap for building a powerful browser extension that seamlessly integrates with your optimized backend to deliver real-time transcription and summarization capabilities across major video conferencing and content platforms.