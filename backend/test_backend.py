#!/usr/bin/env python3
"""
Backend Test Script
Tests all optimized backend functionality including:
- Optimized audio processor initialization
- GPU/CPU detection and switching
- Meeting session logging
- Performance monitoring
- WebSocket connections
"""

import sys
import os
import asyncio
import json
import time
from pathlib import Path

# Add the backend directory to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

def test_imports():
    """Test all imports and basic initialization."""
    print("🧪 Testing imports and initialization...")
    
    try:
        # Test FastAPI components
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        print("✅ FastAPI imports successful")
        
        # Test audio processor
        try:
            from app.services.optimized_audio_processor import OptimizedAudioProcessor
            processor = OptimizedAudioProcessor(model_size="tiny")  # Use tiny for testing
            print("✅ Optimized audio processor loaded successfully")
            print(f"   📊 Model: {processor.model_size}")
            print(f"   🖥️ Device: {processor.current_device}")
            print(f"   💾 System Info: {processor.device_info}")
            
            # Test performance stats
            if hasattr(processor, 'get_performance_stats'):
                stats = processor.get_performance_stats()
                print(f"   📈 Performance Stats: {stats}")
                
            return processor
        except Exception as e:
            print(f"⚠️ Optimized processor failed: {e}")
            print("🔄 Falling back to original processor...")
            from app.services.audio_processor import AudioProcessor
            processor = AudioProcessor(model_size="tiny")
            print("✅ Original audio processor loaded as fallback")
            return processor
            
    except Exception as e:
        print(f"❌ Import test failed: {e}")
        return None

def test_meeting_logger():
    """Test the meeting logger functionality."""
    print("\n🧪 Testing meeting logger...")
    
    try:
        from app.services.meeting_logger import meeting_logger
        
        # Start a test session
        meeting_id = "test_meeting_001"
        participants = ["Test User 1", "Test User 2"]
        
        log_file = meeting_logger.start_meeting_session(meeting_id, participants)
        print(f"✅ Meeting session started: {log_file}")
        
        # Test audio chunk logging
        chunk_info = {
            "chunk_id": "test_chunk_001",
            "size_bytes": 1024,
            "filename": "test_audio.webm"
        }
        meeting_logger.log_audio_chunk_processing(meeting_id, chunk_info)
        
        # Test transcription logging
        transcription_data = {
            "text": "This is a test transcription",
            "language": "en",
            "processing_time": 0.5,
            "confidence": 0.95
        }
        meeting_logger.log_transcription_result(meeting_id, transcription_data)
        
        # Test summary logging
        summary_data = {
            "summary": "Test meeting summary",
            "key_points": ["Point 1", "Point 2"],
            "action_items": ["Action 1"],
            "processing_time": 1.2
        }
        meeting_logger.log_summary_generation(meeting_id, summary_data)
        
        # Test performance logging
        performance_data = {
            "cpu_percent": 45.5,
            "memory_mb": 512,
            "gpu_percent": 30.0
        }
        meeting_logger.log_system_performance(performance_data)
        
        # Get session status
        status = meeting_logger.get_active_sessions_status()
        print(f"✅ Active session status: {status}")
        
        # End session
        summary = meeting_logger.end_meeting_session(meeting_id)
        print(f"✅ Meeting session ended with summary: {summary.get('meeting_id', 'N/A')}")
        
        return True
        
    except Exception as e:
        print(f"❌ Meeting logger test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_gpu_detection():
    """Test GPU detection and optimization."""
    print("\n🧪 Testing GPU detection...")
    
    try:
        import torch
        
        print(f"🔍 CUDA available: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"🎮 GPU count: {torch.cuda.device_count()}")
            for i in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(i)
                print(f"   GPU {i}: {props.name} ({props.total_memory / 1024**3:.1f}GB)")
        
        # Test our GPU check script
        from gpu_check import check_gpu
        gpu_available = check_gpu()
        print(f"✅ GPU check completed: {gpu_available}")
        
        return gpu_available
        
    except Exception as e:
        print(f"❌ GPU detection test failed: {e}")
        return False

def test_audio_processing():
    """Test audio processing capabilities."""
    print("\n🧪 Testing audio processing...")
    
    try:
        # Create a simple test audio array (1 second of sine wave)
        import numpy as np
        
        # Generate test audio: 1 second at 16kHz
        sample_rate = 16000
        duration = 1.0
        frequency = 440  # A4 note
        
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        test_audio = np.sin(2 * np.pi * frequency * t).astype(np.float32) * 0.3
        
        print(f"🎵 Generated test audio: {len(test_audio)} samples")
        
        # Test with optimized processor if available
        try:
            from app.services.optimized_audio_processor import OptimizedAudioProcessor
            processor = OptimizedAudioProcessor(model_size="tiny")
            
            # Test quality check
            if hasattr(processor, '_is_audio_quality_sufficient'):
                quality_ok = processor._is_audio_quality_sufficient(test_audio)
                print(f"✅ Audio quality check: {quality_ok}")
            
            # Test transcription (this will take a moment)
            print("🔄 Testing transcription (this may take a moment)...")
            result = processor.transcribe_real_time(test_audio, language="en")
            print(f"✅ Transcription result: {result}")
            
            # Test performance stats
            if hasattr(processor, 'get_performance_stats'):
                stats = processor.get_performance_stats()
                print(f"📊 Performance stats: {stats}")
            
            return True
            
        except Exception as e:
            print(f"⚠️ Optimized processor test failed: {e}")
            return False
            
    except Exception as e:
        print(f"❌ Audio processing test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_api_endpoints():
    """Test API endpoint availability."""
    print("\n🧪 Testing API endpoints...")
    
    try:
        from app.api.routes import router
        from app.api.websocket import manager
        
        # Check router routes
        routes = []
        for route in router.routes:
            if hasattr(route, 'path'):
                routes.append(f"{route.methods} {route.path}")
        
        print("✅ Available API routes:")
        for route in routes:
            print(f"   📍 {route}")
        
        # Test WebSocket manager
        print(f"✅ WebSocket manager initialized: {type(manager).__name__}")
        
        return True
        
    except Exception as e:
        print(f"❌ API endpoint test failed: {e}")
        return False

def run_comprehensive_test():
    """Run all tests comprehensively."""
    print("🚀 Starting Comprehensive Backend Test")
    print("=" * 60)
    
    test_results = {
        "imports": False,
        "meeting_logger": False,
        "gpu_detection": False,
        "audio_processing": False,
        "api_endpoints": False
    }
    
    # Run all tests
    try:
        processor = test_imports()
        test_results["imports"] = processor is not None
        
        test_results["meeting_logger"] = test_meeting_logger()
        test_results["gpu_detection"] = test_gpu_detection()
        test_results["audio_processing"] = test_audio_processing()
        test_results["api_endpoints"] = test_api_endpoints()
        
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error during testing: {e}")
    
    # Print summary
    print("\n" + "=" * 60)
    print("📋 TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(test_results.values())
    total = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} {test_name.replace('_', ' ').title()}")
    
    print("-" * 60)
    print(f"🎯 Overall: {passed}/{total} tests passed ({(passed/total)*100:.1f}%)")
    
    if passed == total:
        print("🎉 All tests passed! Backend is ready for production.")
    elif passed >= total * 0.8:
        print("⚠️ Most tests passed. Minor issues may need attention.")
    else:
        print("❌ Multiple tests failed. Backend needs attention before deployment.")
    
    return test_results

if __name__ == "__main__":
    # Change to backend directory
    os.chdir(backend_dir)
    
    # Run tests
    results = run_comprehensive_test()
    
    # Exit with appropriate code
    passed = sum(results.values())
    total = len(results)
    
    if passed == total:
        sys.exit(0)  # Success
    else:
        sys.exit(1)  # Some tests failed