import whisper
import torch
import os
from typing import Optional, Dict, List
import time
import numpy as np
import wave
import struct
import io
from pydub import AudioSegment
import logging
import threading
from collections import deque
import gc
from concurrent.futures import ThreadPoolExecutor
import psutil

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OptimizedAudioProcessor:
    def __init__(self, model_size: str = "auto"):
        """
        Initialize the optimized audio processor with adaptive Whisper model.
        
        Args:
            model_size: Size of the Whisper model (tiny, base, small, medium, large, auto)
        """
        self.device_info = self._get_system_info()
        self.model_size = self._select_optimal_model(model_size)
        
        logger.info(f"System info: {self.device_info}")
        logger.info(f"Selected model: {self.model_size}")
        
        # Initialize GPU/CPU settings
        self._setup_device()
        
        # Load model with optimizations
        self._load_model()
        
        # Initialize processing optimizations
        self._setup_optimizations()
        
        # Performance monitoring
        self.performance_stats = {
            "total_processed": 0,
            "avg_processing_time": 0,
            "gpu_utilization": 0,
            "memory_usage": 0,
            "model_switches": 0
        }
        
    def _get_system_info(self) -> Dict:
        """Get comprehensive system information for optimization decisions."""
        info = {
            "cpu_count": psutil.cpu_count(),
            "memory_gb": psutil.virtual_memory().total / (1024**3),
            "has_cuda": torch.cuda.is_available(),
            "gpu_count": 0,
            "gpu_memory_gb": 0,
            "gpu_names": []
        }
        
        if info["has_cuda"]:
            info["gpu_count"] = torch.cuda.device_count()
            for i in range(info["gpu_count"]):
                gpu_props = torch.cuda.get_device_properties(i)
                info["gpu_names"].append(gpu_props.name)
                info["gpu_memory_gb"] = max(info["gpu_memory_gb"], gpu_props.total_memory / (1024**3))
        
        return info
    
    def _select_optimal_model(self, model_size: str) -> str:
        """Select optimal model size based on system capabilities and performance requirements."""
        if model_size != "auto":
            return model_size
        
        # Automatic model selection based on system capabilities
        if self.device_info["has_cuda"] and self.device_info["gpu_memory_gb"] >= 8:
            # High-end GPU: Use larger model for better accuracy
            return "base"  # Could use "small" for even better accuracy if processing time allows
        elif self.device_info["has_cuda"] and self.device_info["gpu_memory_gb"] >= 4:
            # Mid-range GPU: Balance accuracy and speed
            return "base"
        elif self.device_info["has_cuda"]:
            # Low-end GPU: Prioritize speed
            return "tiny"
        elif self.device_info["memory_gb"] >= 8 and self.device_info["cpu_count"] >= 8:
            # High-end CPU system: Use base model
            return "base"
        else:
            # Low-end system: Use tiny model for real-time performance
            return "tiny"
    
    def _setup_device(self):
        """Setup optimal device configuration with fallback capabilities."""
        if self.device_info["has_cuda"]:
            try:
                # Test GPU availability
                torch.cuda.empty_cache()
                self.primary_device = "cuda"
                self.fallback_device = "cpu"
                logger.info("Primary device: CUDA, Fallback: CPU")
            except Exception as e:
                logger.warning(f"CUDA setup failed: {e}. Using CPU.")
                self.primary_device = "cpu"
                self.fallback_device = "cpu"
        else:
            self.primary_device = "cpu"
            self.fallback_device = "cpu"
            logger.info("Using CPU processing")
        
        self.current_device = self.primary_device
        
    def _load_model(self):
        """Load Whisper model with optimization settings."""
        try:
            logger.info(f"Loading Whisper {self.model_size} model on {self.current_device}...")
            self.model = whisper.load_model(self.model_size, device=self.current_device)
            
            # Apply optimizations based on device
            if self.current_device == "cuda":
                try:
                    # Use half precision for GPU to save memory and increase speed
                    self.model = self.model.half()
                    self.use_fp16 = True
                    logger.info("Applied half precision optimization for GPU")
                except Exception as e:
                    logger.warning(f"Half precision failed: {e}")
                    self.use_fp16 = False
            else:
                self.use_fp16 = False
                
            # Test model functionality
            self._test_model()
            logger.info("Model loaded and tested successfully!")
            
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            if self.current_device != self.fallback_device:
                logger.info(f"Falling back to {self.fallback_device}")
                self.current_device = self.fallback_device
                self.performance_stats["model_switches"] += 1
                self._load_model()
            else:
                raise Exception(f"Failed to load model on any device: {e}")
    
    def _test_model(self):
        """Test model with a dummy input to ensure it's working."""
        try:
            # Create a small dummy audio array (1 second of silence at 16kHz)
            dummy_audio = np.zeros(16000, dtype=np.float32)
            result = self.model.transcribe(dummy_audio, language="en", fp16=self.use_fp16)
            logger.info("Model test successful")
        except Exception as e:
            raise Exception(f"Model test failed: {e}")
    
    def _setup_optimizations(self):
        """Setup various optimization features."""
        # Chunk processing queue for batch processing
        self.chunk_queue = deque(maxlen=100)
        self.batch_size = 3 if self.current_device == "cuda" else 1
        
        # Thread pool for parallel processing
        max_workers = min(4, self.device_info["cpu_count"])
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        
        # Rate limiting for real-time processing
        self.last_process_time = 0
        self.min_interval = 0.05 if self.current_device == "cuda" else 0.1
        
        # Audio quality thresholds (optimized based on model size)
        if self.model_size == "tiny":
            self.quality_thresholds = {
                "min_amplitude": 0.002,
                "min_rms": 0.004,
                "min_std": 0.006
            }
        else:
            self.quality_thresholds = {
                "min_amplitude": 0.001,
                "min_rms": 0.003,
                "min_std": 0.005
            }
    
    def transcribe_audio_file(self, file_path: str, language: Optional[str] = None) -> dict:
        """
        Transcribe an audio file with optimized settings and speaker diarization.
        """
        start_time = time.time()
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        try:
            # Determine optimal settings for file processing
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            
            if file_size_mb > 50:  # Large file
                options = self._get_file_options_large(language)
            else:  # Normal file
                options = self._get_file_options_normal(language)
            
            logger.info(f"Processing file: {file_path} ({file_size_mb:.1f}MB) with options: {options}")
            
            # Transcribe with monitoring
            result = self._transcribe_with_monitoring(file_path, options)
            
            # Process segments for speaker information
            processed_segments = self._add_speaker_info(result["segments"])
            
            processing_time = time.time() - start_time
            self._update_performance_stats(processing_time)
            
            return {
                "text": result["text"],
                "language": result["language"],
                "segments": processed_segments,
                "speaker_formatted_text": self._format_speaker_text(processed_segments),
                "processing_time": round(processing_time, 2),
                "model_used": self.model_size,
                "device_used": self.current_device
            }
            
        except Exception as e:
            logger.error(f"File transcription failed: {e}")
            # Try fallback if available
            if self.current_device != self.fallback_device:
                return self._transcribe_with_fallback(file_path, language)
            raise e
    
    def transcribe_chunk(self, audio_chunk: bytes, language: Optional[str] = None) -> dict:
        """
        Transcribe a real-time audio chunk with optimized processing.
        """
        start_time = time.time()
        
        # Enhanced rate limiting
        current_time = time.time()
        if current_time - self.last_process_time < self.min_interval:
            return {
                "text": "",
                "language": language or "en",
                "timestamp": current_time,
                "message": "Rate limited",
                "processing_time": 0
            }
        
        self.last_process_time = current_time
        
        try:
            # Convert audio chunk to numpy array with format detection
            audio_array = self._extract_audio_from_chunk(audio_chunk)
            
            if audio_array is None:
                return self._create_empty_result(language, "Audio extraction failed")
            
            # Enhanced audio quality check
            if not self._is_audio_quality_sufficient(audio_array):
                return self._create_empty_result(language, "Audio quality insufficient")
            
            # Process with optimized settings
            result = self._transcribe_chunk_optimized(audio_array, language)
            
            processing_time = time.time() - start_time
            result["processing_time"] = round(processing_time, 3)
            result["total_time"] = round(processing_time, 3)
            
            self._update_performance_stats(processing_time)
            
            return result
            
        except Exception as e:
            logger.error(f"Chunk transcription failed: {e}")
            return {
                "text": "",
                "language": language or "en", 
                "timestamp": time.time(),
                "error": str(e),
                "processing_time": round(time.time() - start_time, 3)
            }
    
    def _transcribe_chunk_optimized(self, audio_array: np.ndarray, language: Optional[str] = None) -> dict:
        """Optimized chunk transcription with dynamic settings."""
        options = {
            "language": language,
            "fp16": self.use_fp16,
            "best_of": 1,  # Fastest for real-time
            "beam_size": 1,  # Fastest for real-time
            "task": "transcribe",
            "temperature": 0.0,
            "compression_ratio_threshold": 2.4,
            "logprob_threshold": -1.0,  # More sensitive for real-time
            "no_speech_threshold": 0.6,  # Balanced for real-time
            "condition_on_previous_text": False,  # Disable for real-time
            "verbose": False
        }
        
        try:
            result = self.model.transcribe(audio_array, **options)
            text = result["text"].strip()
            
            # Real-time filtering
            if self._is_likely_artifact(text):
                text = ""
            
            return {
                "text": text,
                "language": result["language"],
                "timestamp": time.time()
            }
            
        except Exception as e:
            logger.error(f"Optimized transcription failed: {e}")
            # Try with even simpler settings
            return self._transcribe_chunk_fallback(audio_array, language)
    
    def _transcribe_chunk_fallback(self, audio_array: np.ndarray, language: Optional[str] = None) -> dict:
        """Fallback transcription with minimal settings."""
        try:
            # Simplest possible settings
            result = self.model.transcribe(
                audio_array,
                language=language,
                fp16=False,
                task="transcribe",
                verbose=False
            )
            
            return {
                "text": result["text"].strip(),
                "language": result["language"],
                "timestamp": time.time()
            }
        except Exception as e:
            return {
                "text": "",
                "language": language or "en",
                "timestamp": time.time(),
                "error": f"Fallback failed: {str(e)}"
            }
    
    def _extract_audio_from_chunk(self, audio_chunk: bytes) -> Optional[np.ndarray]:
        """Enhanced audio extraction with better format support."""
        if not audio_chunk or len(audio_chunk) == 0:
            return None
            
        try:
            # Detect format and extract accordingly
            if self._is_webm_format(audio_chunk):
                return self._extract_audio_from_webm(audio_chunk)
            elif self._is_mp4_format(audio_chunk):
                return self._extract_audio_from_mp4(audio_chunk)
            elif self._is_wav_format(audio_chunk):
                return self._parse_wav_chunk(audio_chunk)
            else:
                # Try as raw PCM data
                return self._extract_raw_pcm(audio_chunk)
                
        except Exception as e:
            logger.warning(f"Audio extraction failed: {e}")
            return None
    
    def _is_audio_quality_sufficient(self, audio_array: np.ndarray) -> bool:
        """Enhanced audio quality check with adaptive thresholds."""
        if len(audio_array) == 0:
            return False
            
        # Calculate audio statistics
        max_amplitude = np.max(np.abs(audio_array))
        rms_amplitude = np.sqrt(np.mean(audio_array ** 2))
        std_dev = np.std(audio_array)
        
        # Adaptive thresholds based on audio length
        length_factor = min(len(audio_array) / 8000, 1.0)  # Normalize to 0.5s at 16kHz
        
        min_amplitude = self.quality_thresholds["min_amplitude"] * length_factor
        min_rms = self.quality_thresholds["min_rms"] * length_factor
        min_std = self.quality_thresholds["min_std"] * length_factor
        
        # Check quality criteria
        amplitude_ok = max_amplitude >= min_amplitude
        rms_ok = rms_amplitude >= min_rms
        variation_ok = std_dev >= min_std
        
        # Log quality check results
        logger.debug(f"Audio quality check - Amplitude: {amplitude_ok}, RMS: {rms_ok}, Variation: {variation_ok}")
        
        return amplitude_ok and rms_ok and variation_ok
    
    def _is_likely_artifact(self, text: str) -> bool:
        """Check if transcribed text is likely an artifact."""
        if not text:
            return True
            
        text_lower = text.lower().strip()
        
        # Common artifacts in real-time processing
        artifacts = {
            "you", "uh", "um", "ah", "hm", "hmm", "yeah", "yes", "no", 
            "oh", "so", "the", "and", "but", "well", "like", "just",
            "thank you", "thanks", "okay", "ok"
        }
        
        # Single character or very short meaningless text
        if len(text_lower) <= 2:
            return True
            
        # Check against artifact list
        if text_lower in artifacts:
            return True
            
        # Repetitive characters
        if len(set(text_lower.replace(" ", ""))) <= 2 and len(text) > 3:
            return True
            
        return False
    
    def _get_file_options_normal(self, language: Optional[str]) -> dict:
        """Get optimized options for normal file processing."""
        return {
            "language": language,
            "fp16": self.use_fp16,
            "best_of": 3 if self.current_device == "cuda" else 2,
            "beam_size": 3 if self.current_device == "cuda" else 2,
            "word_timestamps": True,
            "condition_on_previous_text": True,
            "temperature": [0.0, 0.2] if self.current_device == "cuda" else 0.0
        }
    
    def _get_file_options_large(self, language: Optional[str]) -> dict:
        """Get optimized options for large file processing."""
        return {
            "language": language,
            "fp16": self.use_fp16,
            "best_of": 2,  # Reduced for large files
            "beam_size": 2,  # Reduced for large files
            "word_timestamps": True,
            "condition_on_previous_text": True,
            "temperature": 0.0,  # Single temperature for speed
            "compression_ratio_threshold": 2.2,  # More lenient for large files
        }
    
    def _transcribe_with_monitoring(self, file_path: str, options: dict):
        """Transcribe with GPU memory monitoring and fallback."""
        try:
            if self.current_device == "cuda":
                # Monitor GPU memory before processing
                torch.cuda.empty_cache()
                
            result = self.model.transcribe(file_path, **options)
            return result
            
        except torch.cuda.OutOfMemoryError:
            logger.warning("GPU out of memory, switching to CPU")
            return self._transcribe_with_fallback(file_path, options.get("language"))
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            raise e
    
    def _transcribe_with_fallback(self, file_path: str, language: Optional[str]):
        """Fallback transcription on CPU with simplified settings."""
        logger.info("Using fallback CPU transcription")
        
        # Switch to CPU model if needed
        if self.current_device != "cpu":
            self._switch_to_cpu()
        
        options = {
            "language": language,
            "fp16": False,
            "best_of": 1,
            "beam_size": 1,
            "word_timestamps": True,
            "condition_on_previous_text": True
        }
        
        result = self.model.transcribe(file_path, **options)
        processed_segments = self._add_speaker_info(result["segments"])
        
        return {
            "text": result["text"],
            "language": result["language"],
            "segments": processed_segments,
            "speaker_formatted_text": self._format_speaker_text(processed_segments),
            "model_used": self.model_size,
            "device_used": "cpu"
        }
    
    def _switch_to_cpu(self):
        """Switch model to CPU processing."""
        try:
            logger.info("Switching to CPU processing...")
            self.current_device = "cpu"
            self.model = self.model.to("cpu")
            self.use_fp16 = False
            self.performance_stats["model_switches"] += 1
            logger.info("Successfully switched to CPU")
        except Exception as e:
            logger.error(f"Failed to switch to CPU: {e}")
    
    def _update_performance_stats(self, processing_time: float):
        """Update performance statistics."""
        self.performance_stats["total_processed"] += 1
        total = self.performance_stats["total_processed"]
        
        # Update rolling average
        current_avg = self.performance_stats["avg_processing_time"]
        self.performance_stats["avg_processing_time"] = (
            (current_avg * (total - 1) + processing_time) / total
        )
        
        # Update system stats periodically
        if total % 10 == 0:
            self._update_system_stats()
    
    def _update_system_stats(self):
        """Update system performance statistics."""
        try:
            # Memory usage
            process = psutil.Process()
            self.performance_stats["memory_usage"] = process.memory_info().rss / (1024**2)  # MB
            
            # GPU utilization if available
            if self.current_device == "cuda":
                try:
                    gpu_mem_used = torch.cuda.memory_allocated() / (1024**2)  # MB
                    gpu_mem_total = torch.cuda.get_device_properties(0).total_memory / (1024**2)
                    self.performance_stats["gpu_utilization"] = (gpu_mem_used / gpu_mem_total) * 100
                except:
                    pass
                    
        except Exception as e:
            logger.warning(f"Failed to update system stats: {e}")
    
    def get_performance_stats(self) -> dict:
        """Get current performance statistics."""
        self._update_system_stats()
        return {
            **self.performance_stats,
            "current_device": self.current_device,
            "model_size": self.model_size,
            "system_info": self.device_info
        }
    
    def cleanup(self):
        """Cleanup resources."""
        try:
            if hasattr(self, 'executor'):
                self.executor.shutdown(wait=False)
            
            if self.current_device == "cuda":
                torch.cuda.empty_cache()
                
            gc.collect()
            logger.info("Cleanup completed")
        except Exception as e:
            logger.warning(f"Cleanup failed: {e}")
    
    # Helper methods for format detection and extraction
    def _is_webm_format(self, data: bytes) -> bool:
        return data[:4] == b'\x1a\x45\xdf\xa3'
    
    def _is_mp4_format(self, data: bytes) -> bool:
        return (data[:4] == b'\x00\x00\x00\x18' or 
                data[:4] == b'\x00\x00\x00\x20' or 
                (len(data) > 12 and data[4:8] == b'ftyp'))
    
    def _is_wav_format(self, data: bytes) -> bool:
        return data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    
    def _extract_raw_pcm(self, data: bytes) -> Optional[np.ndarray]:
        """Extract audio from raw PCM data."""
        try:
            # Try 16-bit PCM first
            audio_array = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
            return audio_array
        except:
            return None
    
    def _extract_audio_from_webm(self, webm_data: bytes) -> Optional[np.ndarray]:
        """Extract audio from WebM format using pydub."""
        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(webm_data), format="webm")
            samples = audio_segment.get_array_of_samples()
            audio_array = np.array(samples).astype(np.float32) / 32768.0
            
            if audio_segment.channels > 1:
                audio_array = audio_array.reshape((-1, audio_segment.channels))
                audio_array = np.mean(audio_array, axis=1)
            
            return audio_array
        except Exception as e:
            logger.warning(f"WebM extraction failed: {e}")
            return None
    
    def _extract_audio_from_mp4(self, mp4_data: bytes) -> Optional[np.ndarray]:
        """Extract audio from MP4 format using pydub."""
        try:
            audio_segment = AudioSegment.from_file(io.BytesIO(mp4_data), format="mp4")
            samples = audio_segment.get_array_of_samples()
            
            bit_depth = audio_segment.sample_width * 8
            max_val = 2 ** (bit_depth - 1) - 1
            audio_array = np.array(samples).astype(np.float32) / max_val
            
            if audio_segment.channels > 1:
                audio_array = audio_array.reshape((-1, audio_segment.channels))
                audio_array = np.mean(audio_array, axis=1)
            
            # Resample to 16kHz if needed
            if audio_segment.frame_rate != 16000:
                factor = audio_segment.frame_rate / 16000
                indices = np.arange(0, len(audio_array), factor).astype(int)
                indices = indices[indices < len(audio_array)]
                audio_array = audio_array[indices]
            
            return audio_array
        except Exception as e:
            logger.warning(f"MP4 extraction failed: {e}")
            return None
    
    def _parse_wav_chunk(self, audio_chunk: bytes) -> Optional[np.ndarray]:
        """Parse WAV audio chunk."""
        try:
            if len(audio_chunk) < 44:
                return None
                
            if audio_chunk[0:4] != b'RIFF' or audio_chunk[8:12] != b'WAVE':
                return None
            
            # Find data chunk
            data_pos = audio_chunk.find(b'data')
            if data_pos == -1:
                return None
            
            # Extract format info
            fmt_pos = audio_chunk.find(b'fmt ')
            if fmt_pos == -1 or len(audio_chunk) < fmt_pos + 24:
                return None
                
            channels = int.from_bytes(audio_chunk[fmt_pos + 10:fmt_pos + 12], byteorder='little')
            bits_per_sample = int.from_bytes(audio_chunk[fmt_pos + 22:fmt_pos + 24], byteorder='little')
            
            # Extract audio data
            data_size = int.from_bytes(audio_chunk[data_pos + 4:data_pos + 8], byteorder='little')
            audio_data_start = data_pos + 8
            
            if len(audio_chunk) < audio_data_start + data_size:
                return None
                
            audio_data = audio_chunk[audio_data_start:audio_data_start + data_size]
            
            # Convert based on bit depth
            if bits_per_sample == 16:
                audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            elif bits_per_sample == 8:
                audio_array = np.frombuffer(audio_data, dtype=np.uint8).astype(np.float32) / 128.0 - 1.0
            elif bits_per_sample == 32:
                audio_array = np.frombuffer(audio_data, dtype=np.float32)
            else:
                return None
            
            # Convert to mono if stereo
            if channels > 1:
                audio_array = audio_array.reshape((-1, channels))
                audio_array = np.mean(audio_array, axis=1)
            
            return audio_array
        except Exception as e:
            logger.warning(f"WAV parsing failed: {e}")
            return None
    
    def _add_speaker_info(self, segments):
        """Add speaker information to transcription segments."""
        if not segments:
            return segments
            
        processed_segments = []
        current_speaker_id = 0
        last_end_time = 0
        speaker_switch_threshold = 1.0  # 1 second gap indicates speaker change
        
        for segment in segments:
            # Check for speaker change based on timing gap
            if segment["start"] - last_end_time > speaker_switch_threshold:
                current_speaker_id = (current_speaker_id + 1) % 2
            
            segment["speaker"] = f"Speaker {current_speaker_id}"
            processed_segments.append(segment)
            last_end_time = segment["end"]
        
        return processed_segments
    
    def _format_speaker_text(self, segments):
        """Format text with speaker labels."""
        if not segments:
            return ""
            
        formatted_lines = []
        current_speaker = None
        
        for segment in segments:
            speaker = segment.get("speaker", "Unknown")
            text = segment.get("text", "").strip()
            
            if speaker != current_speaker:
                formatted_lines.append(f"\n{speaker}: {text}")
                current_speaker = speaker
            else:
                formatted_lines.append(text)
        
        return " ".join(formatted_lines).strip()
    
    def _create_empty_result(self, language: Optional[str], message: str) -> dict:
        """Create empty result with message."""
        return {
            "text": "",
            "language": language or "en",
            "timestamp": time.time(),
            "message": message,
            "processing_time": 0
        }