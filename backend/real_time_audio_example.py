"""
Real-time Audio Transcription Example

This script demonstrates how to capture audio from a microphone and 
transcribe it in real-time using the Whisper model with optimized performance.

Optimizations include:
- Using a smaller model for faster processing
- GPU acceleration when available
- Direct numpy array processing to avoid file I/O
- Better buffering and chunk management
"""

import pyaudio
import threading
import time
import numpy as np
import torch
from collections import deque
from app.services.audio_processor import AudioProcessor

class RealTimeTranscriber:
    def __init__(self, model_size="base"):
        # Audio parameters - optimized for real-time processing
        self.chunk = 1024         # Record in smaller chunks for lower latency
        self.format = pyaudio.paInt16  # 16 bits per sample
        self.channels = 1
        self.rate = 16000         # Record at 16000 samples per second
        self.buffer_duration = 5  # Buffer 5 seconds of audio
        self.transcription_interval = 1.5  # Transcribe every 1.5 seconds
        
        # Initialize optimized AudioProcessor
        self.audio_processor = AudioProcessor(model_size=model_size)
        
        # Audio recording variables
        self.is_recording = False
        self.audio_buffer = deque(maxlen=int(self.rate * self.buffer_duration / self.chunk))
        self.transcription_callback = None
        self.last_transcription = ""
        
    def set_transcription_callback(self, callback):
        """Set a callback function to receive transcriptions"""
        self.transcription_callback = callback
    
    def start_recording(self):
        """Start recording audio in a separate thread"""
        if self.is_recording:
            return
            
        self.is_recording = True
        self.audio_thread = threading.Thread(target=self._record_audio)
        self.audio_thread.daemon = True
        self.audio_thread.start()
        
        # Start transcription thread
        self.transcription_thread = threading.Thread(target=self._transcribe_continuously)
        self.transcription_thread.daemon = True
        self.transcription_thread.start()
        
        print("Started real-time recording and transcription...")
        print("Press Ctrl+C to stop")
    
    def stop_recording(self):
        """Stop recording audio"""
        self.is_recording = False
        print("Stopped recording")
    
    def _record_audio(self):
        """Record audio in chunks and store in buffer"""
        p = pyaudio.PyAudio()
        
        try:
            stream = p.open(format=self.format,
                            channels=self.channels,
                            rate=self.rate,
                            input=True,
                            frames_per_buffer=self.chunk)
            
            print("Recording... Speak into your microphone")
            
            while self.is_recording:
                # Record a chunk of audio
                data = stream.read(self.chunk, exception_on_overflow=False)
                self.audio_buffer.append(data)
                
        except Exception as e:
            print(f"Audio recording error: {e}")
        finally:
            # Stop and close the stream
            if 'stream' in locals():
                stream.stop_stream()
                stream.close()
            p.terminate()
    
    def _transcribe_continuously(self):
        """Continuously transcribe audio from the buffer"""
        while self.is_recording:
            # Wait for enough audio data (at least 3 seconds worth)
            if len(self.audio_buffer) >= int(3 * self.rate / self.chunk):
                # Combine recent audio chunks
                combined_audio = b''.join(list(self.audio_buffer)[-int(3 * self.rate / self.chunk):])
                
                # Convert to numpy array directly (avoid file I/O)
                audio_array = np.frombuffer(combined_audio, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Transcribe the audio
                try:
                    result = self.audio_processor.transcribe_real_time(audio_array)
                    transcription = result["text"].strip()
                    
                    # Only process non-empty transcriptions that are different from last one
                    if transcription and transcription != self.last_transcription:
                        self.last_transcription = transcription
                        if self.transcription_callback:
                            self.transcription_callback(transcription)
                        
                except Exception as e:
                    print(f"Transcription error: {e}")
            
            # Wait before next transcription
            time.sleep(self.transcription_interval)
    
    def transcribe_file(self, filename):
        """Transcribe a saved audio file"""
        try:
            result = self.audio_processor.transcribe_audio_file(filename)
            return result["text"]
        except Exception as e:
            print(f"File transcription error: {e}")
            return ""

def print_transcription(text):
    """Callback function to print transcriptions"""
    print(f"[{time.strftime('%H:%M:%S')}] Transcribed: {text}")

if __name__ == "__main__":
    # Initialize the real-time transcriber with optimized settings
    transcriber = RealTimeTranscriber(model_size="base")
    transcriber.set_transcription_callback(print_transcription)
    
    try:
        # Start real-time recording and transcription
        transcriber.start_recording()
        
        # Keep the main thread alive
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nStopping...")
        transcriber.stop_recording()
        print("Done!")