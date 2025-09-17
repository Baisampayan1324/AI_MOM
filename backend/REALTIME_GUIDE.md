# Real-time Audio Processing Guide

This guide explains how to use the real-time audio processing features of the Meeting Minutes system.

## Real-time Audio Capture

The system provides real-time transcription of live audio input through your microphone. This feature is optimized for low latency and high accuracy.

## How It Works

1. **Audio Capture**: The system captures audio from your microphone in small chunks (typically 1-2 seconds)
2. **Processing**: Each chunk is processed through the Whisper model for transcription
3. **Display**: Results are displayed in real-time in your browser
4. **Speaker Alerts**: The system monitors for mentions of your name or keywords and generates alerts

## Technical Details

### Audio Chunking
- **Chunk Size**: Audio is captured in 1-2 second segments for optimal balance of latency and accuracy
- **Overlap Processing**: Adjacent chunks are processed with overlap to ensure continuity
- **Silence Detection**: The system intelligently detects silence to avoid processing empty audio

### Model Optimization
- **Model Selection**: Uses the "base" Whisper model for a balance of speed and accuracy
- **GPU Acceleration**: Automatically utilizes GPU when available for faster processing
- **Reduced Parameters**: Optimized model parameters for real-time performance

### WebSocket Communication
- **Real-time Updates**: WebSocket connections provide immediate updates to the browser
- **Low Latency**: Optimized communication for minimal delay
- **Error Handling**: Robust error handling for connection issues

## Browser Requirements

- Modern web browser with JavaScript enabled
- Microphone permissions granted
- WebSocket support

## Performance Considerations

### CPU vs GPU Processing
- **CPU Processing**: Slower but works on all systems
- **GPU Processing**: Significantly faster when CUDA-compatible GPU is available

### Network Considerations
- Localhost deployment provides lowest latency
- Network deployment may introduce slight delays

## Troubleshooting

### Common Issues

1. **No Transcription Output**
   - Check microphone permissions in browser
   - Verify microphone is working in system settings
   - Check browser console for JavaScript errors

2. **Poor Transcription Quality**
   - Ensure good microphone placement
   - Minimize background noise
   - Check audio levels in system settings

3. **Connection Issues**
   - Verify backend server is running
   - Check WebSocket connections are not blocked
   - Ensure no firewall is blocking connections

### Browser Compatibility

The system has been tested with:
- Chrome (recommended)
- Firefox
- Edge
- Safari

## Advanced Configuration

### Model Selection
The system automatically selects the optimal Whisper model based on your hardware:
- **"tiny" model**: For low-memory systems or when fastest processing is needed
- **"base" model**: For balance of speed and accuracy (default)
- **"small" model**: For higher accuracy when processing speed is less critical

### Audio Settings
You can adjust audio capture settings in the frontend:
- Sample rate: 16kHz (standard for speech recognition)
- Channels: Mono (automatically converted from stereo if needed)
- Echo cancellation: Enabled by default
- Noise suppression: Enabled by default
- Automatic gain control: Enabled by default

## API Integration

For developers wanting to integrate real-time audio processing into their own applications:

### WebSocket Endpoint
`ws://localhost:8000/ws/meeting/{meeting_id}`

### Audio Chunk Endpoint
`POST /api/process-audio-chunk`

## Performance Monitoring

The system provides real-time performance feedback:
- Processing times for each audio chunk
- Memory usage information
- GPU utilization when available

## Data Privacy

- Audio data is processed locally and not stored on external servers
- Transcription results are stored in browser localStorage for 24 hours
- No personal data is transmitted to external services