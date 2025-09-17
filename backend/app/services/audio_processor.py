import whisper
import torch
import os
from typing import Optional
import time
import numpy as np
import wave
import struct
import io
from pydub import AudioSegment

class AudioProcessor:
    def __init__(self, model_size: str = "base"):
        """
        Initialize the audio processor with a Whisper model.
        
        Args:
            model_size: Size of the Whisper model (tiny, base, small, medium, large)
        """
        # Auto-select model size based on system capabilities
        self.model_size = self._select_optimal_model()
        print(f"Loading Whisper {self.model_size} model...")
        
        # Check if CUDA is available for GPU acceleration
        if torch.cuda.is_available():
            print("Using GPU acceleration")
            self.device = "cuda"
        else:
            print("Using CPU processing")
            self.device = "cpu"
            
        # Load model with optimized settings for real-time processing
        self.model = whisper.load_model(self.model_size, device=self.device)
        
        # Optimize model for inference if on CUDA
        if self.device == "cuda":
            self.model = self.model.half()  # Use half precision for faster GPU processing
            
        print("Whisper model loaded successfully!")
    
    def _select_optimal_model(self) -> str:
        """
        Select optimal model size based on system capabilities.
        """
        # For real-time processing, use "tiny" for fastest processing or "base" for better accuracy
        # Check if we have sufficient GPU memory for "base" model
        if torch.cuda.is_available():
            # Get GPU memory info
            try:
                gpu_mem = torch.cuda.get_device_properties(0).total_memory
                # If we have more than 4GB GPU memory, we can use "base" model
                if gpu_mem > 4 * 1024 * 1024 * 1024:  # 4GB in bytes
                    return "base"
                else:
                    return "tiny"  # Use smaller model for low-memory GPUs
            except:
                return "base"  # Default to base if we can't get memory info
        else:
            # For CPU systems, use "tiny" for reasonable performance
            return "tiny"
    
    def transcribe_audio_file(self, file_path: str, language: Optional[str] = None) -> dict:
        """
        Transcribe an audio file using Whisper with optimized settings and speaker diarization.
        
        Args:
            file_path: Path to the audio file
            language: Language of the audio (optional)
            
        Returns:
            Dictionary containing transcription result with speaker information
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        # Prepare options for transcription with word-level timing
        options = {
            "language": language,
            "fp16": False,  # Use float32 instead of float16 for CPU compatibility
            "best_of": 2,   # Reduce for faster processing
            "beam_size": 2, # Reduce for faster processing
            "word_timestamps": True,  # Enable word-level timestamps for speaker diarization,
            "condition_on_previous_text": True  # Enable for file processing for better context
        }
        
        # Transcribe the audio
        result = self.model.transcribe(file_path, **options)
        
        # Process segments to add speaker information
        processed_segments = self._add_speaker_info(result["segments"])
        
        return {
            "text": result["text"],
            "language": result["language"],
            "segments": processed_segments,
            "speaker_formatted_text": self._format_speaker_text(processed_segments)
        }
    
    def _add_speaker_info(self, segments):
        """
        Add speaker information to transcription segments.
        Improved approach that better distinguishes between speakers based on timing gaps.
        """
        if not segments:
            return segments
            
        # Enhanced speaker assignment logic optimized for real-time processing
        processed_segments = []
        last_end_time = 0
        speaker_switch_threshold = 0.5  # Reduced threshold for more responsive speaker switching in real-time
        
        # Start with Speaker 0
        current_speaker_id = 0
        
        for i, segment in enumerate(segments):
            # If there's a significant gap since the last segment, likely a new speaker
            if segment["start"] - last_end_time > speaker_switch_threshold:
                # Switch speaker (alternate between 0 and 1 for simplicity)
                current_speaker_id = (current_speaker_id + 1) % 2
            
            # Add speaker info to segment
            segment["speaker"] = f"Speaker {current_speaker_id}"
            processed_segments.append(segment)
            last_end_time = segment["end"]
            
        return processed_segments
    
    def _format_speaker_text(self, segments):
        """
        Format text with speaker labels for easy reading, with each speaker on a new line.
        Includes color coding for different speakers using ANSI escape codes.
        """
        if not segments:
            return ""
            
        formatted_lines = []
        current_speaker = None
        
        # Define colors for different speakers (ANSI escape codes)
        speaker_colors = {
            "Speaker 0": "\033[92m",  # Green
            "Speaker 1": "\033[94m",  # Blue
            "Speaker 2": "\033[93m",  # Yellow
            "Speaker 3": "\033[95m",  # Magenta
            "Speaker 4": "\033[96m",  # Cyan
            "Speaker 5": "\033[91m",  # Red
        }
        reset_color = "\033[0m"  # Reset to default color
        
        # Format with each speaker's content on separate lines
        for segment in segments:
            speaker = segment.get("speaker", "Unknown")
            text = segment.get("text", "").strip()
            
            if speaker != current_speaker:
                # New speaker, add speaker label on a new line with color
                color = speaker_colors.get(speaker, "")
                formatted_lines.append(f"\n{color}{speaker}:{reset_color} {text}")
                current_speaker = speaker
            else:
                # Same speaker, just add text
                formatted_lines.append(text)
                
        # Join all lines and clean up extra whitespace
        result = " ".join(formatted_lines).strip()
        # Ensure there's a newline at the beginning for better formatting
        if not result.startswith('\n'):
            result = '\n' + result
        return result
    
    def transcribe_real_time(self, audio_data: np.ndarray, language: Optional[str] = None) -> dict:
        """
        Transcribe real-time audio data efficiently.
        
        Args:
            audio_data: Audio data as numpy array
            language: Language of the audio (optional)
            
        Returns:
            Transcription result
        """
        # Prepare options for transcription optimized for real-time processing
        options = {
            "language": language,
            "fp16": False,
            "best_of": 1,      # Reduced for faster processing
            "beam_size": 1,    # Reduced for faster processing
            "task": "transcribe",
            "temperature": 0.0,  # Single temperature for faster results
            "compression_ratio_threshold": 2.4,
            "logprob_threshold": -1.5,  # More sensitive to detect speech
            "no_speech_threshold": 0.7,  # Slightly higher to reduce false positives but still detect speech
            "condition_on_previous_text": False,  # Disable for real-time processing
            "verbose": False
        }
        
        # Transcribe directly from numpy array (more efficient)
        try:
            result = self.model.transcribe(audio_data, **options)
            transcription_text = result["text"].strip()
            print(f"Whisper transcription result: '{transcription_text}' (length: {len(transcription_text)})")
            
            # Additional filtering for real-time processing
            # Filter out very short transcriptions that are likely artifacts
            if len(transcription_text) > 0 and len(transcription_text) < 3:
                # Single words like "you", "uh", "um" are often artifacts
                common_artifacts = ["you", "uh", "um", "ah", "hm", "hmm", "yeah", "yes", "no", ""]
                if transcription_text.lower() in common_artifacts:
                    print(f"Filtering out likely artifact: '{transcription_text}'")
                    transcription_text = ""
            
            return {
                "text": transcription_text,
                "language": result["language"],
                "timestamp": time.time()
            }
        except Exception as e:
            return {
                "text": "",
                "language": language or "en",
                "timestamp": time.time(),
                "error": str(e)
            }
    
    # Rate limiting optimized for real-time processing
    last_process_time = 0
    min_interval = 0.05  # Minimum 50ms between processing for more responsive real-time transcription
    
    def transcribe_chunk(self, audio_chunk: bytes, language: Optional[str] = None) -> dict:
        """
        Transcribe a raw audio chunk.

        Args:
            audio_chunk: Raw audio data
            language: Language of the audio (optional)
            
        Returns:
            Transcription result
        """
        # Record start time
        import time
        start_time = time.time()
        
        # Simple rate limiting
        current_time = time.time()
        if current_time - self.last_process_time < self.min_interval:
            print(f"Skipping chunk - rate limited (interval: {current_time - self.last_process_time:.3f}s)")
            return {
                "text": "",
                "language": language or "en",
                "timestamp": current_time,
                "message": "Rate limited"
            }
        
        self.last_process_time = current_time
        
        try:
            # Check if we have valid audio data
            if not audio_chunk or len(audio_chunk) == 0:
                print("Received empty audio chunk")
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time()
                }
            
            print(f"Processing audio chunk of {len(audio_chunk)} bytes")
            
            # Log first few bytes for debugging (first 100 bytes)
            if len(audio_chunk) > 0:
                print(f"First 100 bytes (hex): {audio_chunk[:100].hex()}")
            
            # Handle different audio formats
            audio_array = None
            
            # Check for MP4 format first (better compatibility with Whisper)
            # MP4 files typically start with specific bytes
            if (audio_chunk[:4] == b'\x00\x00\x00\x18' or 
                audio_chunk[:4] == b'\x00\x00\x00\x20' or 
                audio_chunk[:8] == b'\x00\x00\x00\x14ftyp' or
                (len(audio_chunk) > 12 and audio_chunk[4:8] == b'ftyp')):
                print("Detected MP4 audio chunk, attempting to process with pydub")
                try:
                    audio_array = self._extract_audio_from_mp4(audio_chunk)
                    if audio_array is not None:
                        print(f"Successfully extracted audio from MP4, array shape: {audio_array.shape if hasattr(audio_array, 'shape') else 'N/A'}")
                except Exception as mp4_error:
                    print(f"MP4 extraction failed: {mp4_error}")
            
            # Check if this is a WebM file (based on the hex headers in the logs)
            if audio_array is None and audio_chunk[:4] == b'\x1a\x45\xdf\xa3':  # WebM signature
                print("Detected WebM audio chunk, attempting to process with pydub")
                # For WebM, we'll use pydub to decode it properly
                try:
                    audio_array = self._extract_audio_from_webm(audio_chunk)
                    if audio_array is not None:
                        print(f"Successfully extracted audio from WebM, array shape: {audio_array.shape if hasattr(audio_array, 'shape') else 'N/A'}")
                    else:
                        print("WebM extraction returned None")
                except Exception as webm_error:
                    print(f"WebM extraction failed: {webm_error}")
            
            # If we still don't have audio data, try other approaches
            if audio_array is None:
                # Try to parse as WAV first (with proper header checking)
                try:
                    print("Attempting WAV parsing...")
                    audio_array = self._parse_wav_chunk(audio_chunk)
                    print(f"Successfully parsed WAV chunk, audio array shape: {audio_array.shape if hasattr(audio_array, 'shape') else 'N/A'}")
                except Exception as wav_error:
                    print(f"WAV parsing failed: {wav_error}")
                    # Try multiple conversion approaches in order of likelihood
                    
                    # First, try 16-bit PCM (most common for WebRTC)
                    try:
                        print("Attempting direct 16-bit PCM conversion...")
                        # Ensure buffer size is appropriate for 16-bit samples
                        if len(audio_chunk) % 2 != 0:
                            print("Warning: Audio chunk size not divisible by 2, trimming last byte")
                            audio_chunk = audio_chunk[:-1]
                        
                        if len(audio_chunk) >= 2:
                            audio_array = np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32) / 32768.0
                            print(f"Successfully converted 16-bit PCM, audio array shape: {audio_array.shape}")
                        else:
                            # If chunk is too small, it might be silence - create a small silent array
                            print("Audio chunk too small for 16-bit conversion, creating silence array")
                            audio_array = np.zeros(1600, dtype=np.float32)  # 0.1 seconds of silence at 16kHz
                    except Exception as conv_error:
                        print(f"16-bit PCM conversion failed: {conv_error}")
                        
                        # Try 32-bit float
                        try:
                            print("Attempting 32-bit float conversion...")
                            # Ensure buffer size is appropriate for 32-bit samples
                            if len(audio_chunk) % 4 != 0:
                                print("Warning: Audio chunk size not divisible by 4, may be truncated")
                                # Trim to nearest multiple of 4
                                trim_size = len(audio_chunk) - (len(audio_chunk) % 4)
                                if trim_size >= 4:
                                    audio_chunk_trimmed = audio_chunk[:trim_size]
                                    audio_array = np.frombuffer(audio_chunk_trimmed, dtype=np.float32)
                                    print(f"Successfully converted 32-bit float (trimmed), audio array shape: {audio_array.shape}")
                                else:
                                    # If chunk is too small, create silence array
                                    print("Audio chunk too small for 32-bit conversion, creating silence array")
                                    audio_array = np.zeros(1600, dtype=np.float32)  # 0.1 seconds of silence at 16kHz
                            else:
                                audio_array = np.frombuffer(audio_chunk, dtype=np.float32)
                                print(f"Successfully converted 32-bit float, audio array shape: {audio_array.shape}")
                        except Exception as float_error:
                            print(f"32-bit float conversion failed: {float_error}")
                            
                            # Try 8-bit as last resort
                            try:
                                print("Attempting 8-bit conversion...")
                                audio_array = np.frombuffer(audio_chunk, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
                                print(f"Successfully converted 8-bit, audio array shape: {audio_array.shape}")
                            except Exception as final_error:
                                print(f"8-bit conversion failed: {final_error}")
                                # If all conversion attempts fail, create a small silence array as fallback
                                print(f"All audio conversion attempts failed, using silence fallback")
                                audio_array = np.zeros(1600, dtype=np.float32)  # 0.1 seconds of silence at 16kHz

            # Ensure we have a valid audio array
            if audio_array is None or len(audio_array) == 0:
                print("Audio array is empty or None")
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time(),
                    "error": "Audio array is empty or None"
                }

            print(f"Audio array length: {len(audio_array)}, first 10 samples: {audio_array[:10] if len(audio_array) >= 10 else audio_array}")

            # Additional debugging - check if all samples are zero
            if len(audio_array) > 0:
                zero_count = np.count_nonzero(audio_array == 0)
                zero_percentage = (zero_count / len(audio_array)) * 100
                print(f"Zero samples: {zero_count}/{len(audio_array)} ({zero_percentage:.2f}%)")
                
                # If more than 90% of samples are zero, this might be a problem
                if zero_percentage > 90:
                    print("WARNING: High percentage of zero samples detected!")

            # Reshape if needed (handle stereo to mono conversion)
            if len(audio_array.shape) > 1 and audio_array.shape[1] > 1:
                print(f"Converting stereo audio ({audio_array.shape}) to mono")
                # Convert stereo to mono by averaging channels
                audio_array = np.mean(audio_array, axis=1)
                print(f"After mono conversion: {audio_array.shape}")

            # Check if audio array has meaningful data
            max_amplitude = np.max(np.abs(audio_array))
            rms_amplitude = np.sqrt(np.mean(audio_array**2))
            std_dev = np.std(audio_array)

            print(f"Audio statistics - Max: {max_amplitude:.4f}, RMS: {rms_amplitude:.4f}, Std: {std_dev:.4f}")
            print(f"Audio array length: {len(audio_array)} samples")

            # Additional debugging - check if all samples are zero
            if len(audio_array) > 0:
                zero_count = np.count_nonzero(audio_array == 0)
                zero_percentage = (zero_count / len(audio_array)) * 100
                print(f"Zero samples: {zero_count}/{len(audio_array)} ({zero_percentage:.2f}%)")
                
                # If more than 90% of samples are zero, this might be a problem
                if zero_percentage > 90:
                    print("WARNING: High percentage of zero samples detected!")

            # More intelligent thresholds for real-time processing
            # Check multiple metrics to determine if this is actual speech

            # Level 1: Almost complete silence
            if max_amplitude < 0.001:
                print("Level 1 silence detected - almost no audio")
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time(),
                    "message": "Audio too quiet - likely silence",
                    "max_amplitude": float(max_amplitude),
                    "rms_amplitude": float(rms_amplitude),
                    "std_dev": float(std_dev)
                }

            # Level 2: Very low RMS (background noise level)
            # Adjusted threshold based on audio length - shorter audio needs higher sensitivity
            rms_threshold = 0.005 if len(audio_array) > 8000 else 0.003
            if rms_amplitude < rms_threshold:
                print(f"Level 2 silence detected - RMS below threshold ({rms_threshold})")
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time(),
                    "message": "Audio RMS too low - likely background noise",
                    "max_amplitude": float(max_amplitude),
                    "rms_amplitude": float(rms_amplitude),
                    "std_dev": float(std_dev)
                }

            # Level 3: Low variation (constant signal)
            # Adjusted threshold based on audio length
            std_threshold = 0.01 if len(audio_array) > 8000 else 0.005
            if std_dev < std_threshold:
                print(f"Level 3 silence detected - low variation (threshold: {std_threshold})")
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time(),
                    "message": "Audio has low variation - likely constant signal",
                    "max_amplitude": float(max_amplitude),
                    "rms_amplitude": float(rms_amplitude),
                    "std_dev": float(std_dev)
                }

            # Additional check: If we have good amplitude but very low RMS, 
            # it might be clicks or artifacts
            if max_amplitude > 0.1 and rms_amplitude < 0.01:
                print("Potential artifact detected - high peaks but low RMS")
                # This might be clicks or artifacts, but let's still process it
                # since it has significant peaks

            print("Audio quality appears acceptable, sending to Whisper...")

            # Transcribe the audio
            transcription_start = time.time()
            result = self.transcribe_real_time(audio_array, language)
            transcription_time = time.time() - transcription_start

            # Add timing information to result
            if isinstance(result, dict):
                result["processing_time"] = round(transcription_time, 3)

            # Calculate total processing time
            total_time = time.time() - start_time
            if isinstance(result, dict):
                result["total_time"] = round(total_time, 3)

            print(f"Transcription result: {result}")

            # If we got a transcription, return it
            if result.get("text", "").strip():
                return result
            else:
                # If no text but no errors, it was likely silence
                return {
                    "text": "",
                    "language": language or "en",
                    "timestamp": time.time(),
                    "message": "No speech detected in audio",
                    "processing_time": result.get("processing_time", 0),
                    "total_time": result.get("total_time", 0),
                    "audio_stats": {
                        "max_amplitude": float(max_amplitude),
                        "rms_amplitude": float(rms_amplitude),
                        "std_dev": float(std_dev)
                    }
                }

        except Exception as e:
            print(f"Error in transcribe_chunk: {e}")
            import traceback
            traceback.print_exc()
            return {
                "text": "",
                "language": language or "en",
                "timestamp": time.time(),
                "error": str(e)
            }

    def _extract_audio_from_webm(self, webm_data: bytes) -> np.ndarray:
        """
        Extract audio data from WebM format using pydub.
        
        Args:
            webm_data: WebM formatted audio data
            
        Returns:
            Audio data as numpy array, or None if extraction fails
        """
        try:
            print(f"WebM data size: {len(webm_data)} bytes")
            
            # Use pydub to decode WebM audio
            audio_segment = AudioSegment.from_file(io.BytesIO(webm_data), format="webm")
            print(f"Decoded audio - duration: {len(audio_segment)}ms, channels: {audio_segment.channels}, frame_rate: {audio_segment.frame_rate}")
            
            # Get the raw audio data
            samples = audio_segment.get_array_of_samples()
            print(f"Raw samples count: {len(samples)}")
            
            # Convert to numpy array
            audio_array = np.array(samples).astype(np.float32) / 32768.0
            
            # If stereo, convert to mono
            if audio_segment.channels > 1:
                print("Converting stereo to mono")
                # Reshape to separate channels
                audio_array = audio_array.reshape((-1, audio_segment.channels))
                # Convert to mono by averaging channels
                audio_array = np.mean(audio_array, axis=1)
            
            print(f"Final audio array shape: {audio_array.shape}")
            return audio_array
        except Exception as e:
            print(f"WebM extraction failed: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _parse_wav_chunk(self, audio_chunk: bytes) -> np.ndarray:
        """
        Parse WAV audio chunk and extract audio data as numpy array.
        
        Args:
            audio_chunk: Raw WAV audio data
            
        Returns:
            Audio data as numpy array
        """
        # More robust WAV parsing
        # Check minimum size
        if len(audio_chunk) < 44:  # Minimum WAV header size
            raise ValueError("Audio chunk too small to be valid WAV")
        
        # Check RIFF header
        if audio_chunk[0:4] != b'RIFF':
            raise ValueError("Not a valid WAV file - missing RIFF header")
        
        # Check WAVE header
        if audio_chunk[8:12] != b'WAVE':
            raise ValueError("Not a valid WAV file - missing WAVE header")
        
        # Find fmt chunk
        fmt_pos = audio_chunk.find(b'fmt ')
        if fmt_pos == -1:
            raise ValueError("Not a valid WAV file - missing fmt chunk")
        
        # Find data chunk
        data_pos = audio_chunk.find(b'data')
        if data_pos == -1:
            raise ValueError("Not a valid WAV file - missing data chunk")
        
        # Parse format information (skip 20 bytes to get to format data)
        if len(audio_chunk) < fmt_pos + 20:
            raise ValueError("Invalid WAV format - insufficient data")
        
        # Extract audio format parameters
        # Audio format (2 bytes at fmt_pos + 8)
        audio_format = int.from_bytes(audio_chunk[fmt_pos + 8:fmt_pos + 10], byteorder='little')
        # Number of channels (2 bytes at fmt_pos + 10)
        channels = int.from_bytes(audio_chunk[fmt_pos + 10:fmt_pos + 12], byteorder='little')
        # Sample rate (4 bytes at fmt_pos + 12)
        sample_rate = int.from_bytes(audio_chunk[fmt_pos + 12:fmt_pos + 16], byteorder='little')
        # Bits per sample (2 bytes at fmt_pos + 22)
        bits_per_sample = int.from_bytes(audio_chunk[fmt_pos + 22:fmt_pos + 24], byteorder='little')
        
        # Validate format (1 = PCM)
        if audio_format != 1:
            raise ValueError(f"Unsupported audio format: {audio_format} (only PCM supported)")
        
        # Extract data size and position
        data_size = int.from_bytes(audio_chunk[data_pos + 4:data_pos + 8], byteorder='little')
        audio_data_start = data_pos + 8
        
        # Extract audio data
        if len(audio_chunk) < audio_data_start + data_size:
            raise ValueError("Invalid WAV file - data size mismatch")
        
        audio_data = audio_chunk[audio_data_start:audio_data_start + data_size]
        
        # Convert based on bits per sample
        if bits_per_sample == 16:
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        elif bits_per_sample == 8:
            audio_array = np.frombuffer(audio_data, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
        elif bits_per_sample == 32:
            audio_array = np.frombuffer(audio_data, dtype=np.float32)
        else:
            raise ValueError(f"Unsupported bits per sample: {bits_per_sample}")
        
        # Reshape for multi-channel audio
        if channels > 1:
            audio_array = audio_array.reshape((-1, channels))
            # Convert to mono by averaging channels
            audio_array = np.mean(audio_array, axis=1)
        
        return audio_array
    
    def _extract_audio_from_mp4(self, mp4_data: bytes) -> np.ndarray:
        """
        Attempt to extract audio data from MP4 format.
        
        Args:
            mp4_data: MP4 formatted audio data
            
        Returns:
            Audio data as numpy array, or None if extraction fails
        """
        try:
            print(f"MP4 data size: {len(mp4_data)} bytes")
            
            # Use pydub to decode MP4 audio
            audio_segment = AudioSegment.from_file(io.BytesIO(mp4_data), format="mp4")
            print(f"Decoded MP4 audio - duration: {len(audio_segment)}ms, channels: {audio_segment.channels}, frame_rate: {audio_segment.frame_rate}")
            
            # Get the raw audio data
            samples = audio_segment.get_array_of_samples()
            print(f"Raw samples count: {len(samples)}")
            
            # Convert to numpy array and normalize to [-1, 1] range
            audio_array = np.array(samples).astype(np.float32)
            
            # Normalize based on bit depth (16-bit audio has max value of 32767)
            bit_depth = audio_segment.sample_width * 8
            max_val = 2 ** (bit_depth - 1) - 1
            audio_array = audio_array / max_val
            
            # If stereo, convert to mono
            if audio_segment.channels > 1:
                print("Converting stereo to mono")
                # Reshape to separate channels
                audio_array = audio_array.reshape((-1, audio_segment.channels))
                # Convert to mono by averaging channels
                audio_array = np.mean(audio_array, axis=1)
            
            # Resample to 16kHz if needed (Whisper works best at 16kHz)
            if audio_segment.frame_rate != 16000:
                print(f"Converting from {audio_segment.frame_rate}Hz to 16000Hz")
                # Simple resampling - in production, you might want to use a proper resampling library
                # For now, we'll do a basic downsampling
                if audio_segment.frame_rate > 16000:
                    # Downsample by taking every nth sample
                    factor = audio_segment.frame_rate / 16000
                    indices = np.arange(0, len(audio_array), factor).astype(int)
                    indices = indices[indices < len(audio_array)]
                    audio_array = audio_array[indices]
            
            print(f"Final audio array shape: {audio_array.shape}")
            return audio_array
        except Exception as e:
            print(f"MP4 extraction failed: {e}")
            import traceback
            traceback.print_exc()
            return None