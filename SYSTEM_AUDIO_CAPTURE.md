# System Audio Capture Guide

## Overview

This guide explains how to use the system audio capture feature in the Meeting Assistant extension. This feature allows you to capture audio directly from online meetings (Google Meet, Zoom, etc.) without needing to install additional software.

## How It Works

The system audio capture feature uses the browser's built-in `getDisplayMedia()` API, which allows websites and extensions to capture audio from:
- Entire screen (with audio)
- Specific windows (with audio)
- Specific browser tabs (with audio)

## Using System Audio Capture

### In the Browser Extension

1. Click the Meeting Assistant extension icon
2. Toggle "System Audio Capture" to ON
3. Enter meeting details (ID, language)
4. Click "Start Recording"
5. When prompted by the browser, select what to share:
   - Choose the tab/window with your meeting
   - Make sure "Share audio" is checked
6. Click "Share"
7. The extension will begin capturing audio from your meeting
8. You can still hear the meeting audio normally through your speakers/headphones
9. Click "Stop Recording" when finished

### In the Test Page

1. Open `frontend/system_audio_test.html` in your browser
2. Click "Start System Audio Capture"
3. When prompted by the browser, select what to share:
   - Choose a tab with audio (YouTube, Google Meet, etc.)
   - Make sure "Share audio" is checked
4. Click "Share"
5. You will see audio information after stopping the capture

## Important Notes

### Browser Permissions
- You must explicitly grant permission each time through the browser dialog
- This is a security feature and cannot be bypassed
- The browser will always prompt you to select what to share

### Audio Quality
- System audio capture preserves the original audio quality
- No echo cancellation or noise suppression is applied
- You can hear the audio normally while it's being captured

### Compatibility
- Works with Chrome, Edge, and other Chromium-based browsers
- Requires a secure context (HTTPS or localhost)
- May not work with all audio sources

## Troubleshooting

### Common Issues

1. **"Permission denied" error**
   - Make sure to click "Share" when the browser prompts you
   - Check that your browser allows screen sharing

2. **No audio captured**
   - Ensure "Share audio" is checked in the browser prompt
   - Verify that audio is playing in the selected tab/window
   - Check system audio settings

3. **Audio quality issues**
   - Make sure the source audio is clear
   - Check that no other applications are interfering

### Browser Settings

If you're having issues with system audio capture:

1. Check Chrome settings:
   - Go to `chrome://settings/content/microphone`
   - Ensure the site has permission to access microphone/screen

2. Check system settings:
   - Ensure your browser has permission to access screen recording
   - On macOS, check System Preferences > Security & Privacy > Screen Recording
   - On Windows, check app permissions for microphone/screen access

## Technical Details

### Implementation

The system audio capture is implemented using:

```javascript
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: false,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }
});
```

### Why These Settings?

- `video: false`: We only want audio, not video
- `echoCancellation: false`: Preserves original audio quality
- `noiseSuppression: false`: Preserves original audio quality
- `autoGainControl: false`: Preserves original audio levels

These settings ensure the highest quality audio capture, which is important for accurate transcription.

## Best Practices

1. **For Meetings**:
   - Select the specific tab with your meeting rather than the entire screen
   - Mute your microphone to avoid feedback
   - Ensure good internet connection for smooth operation

2. **For Optimal Results**:
   - Use in a quiet environment
   - Ensure the meeting audio is clear and audible
   - Position speakers appropriately for best sound quality

3. **Privacy Considerations**:
   - Only share tabs/windows that contain meeting content
   - Be mindful of what's visible in shared windows
   - Stop recording when the meeting ends