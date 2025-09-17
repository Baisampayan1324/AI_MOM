"""
Script to list and play saved audio files from the temp folder
"""
import os
import glob
from datetime import datetime

def list_saved_audio_files():
    """List all saved audio files in the temp folder"""
    # Define the temp folder path
    temp_folder = os.path.join(os.path.dirname(__file__), "temp_audio")
    
    # Create the folder if it doesn't exist
    os.makedirs(temp_folder, exist_ok=True)
    
    # Find all webm files
    pattern = os.path.join(temp_folder, "*.webm")
    files = glob.glob(pattern)
    
    # Sort by modification time (newest first)
    files.sort(key=os.path.getmtime, reverse=True)
    
    print("Saved Audio Files in Temp Folder:")
    print("=" * 50)
    
    if not files:
        print("No audio files found.")
        return
    
    for i, file_path in enumerate(files, 1):
        # Get file info
        file_size = os.path.getsize(file_path)
        mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
        
        # Get filename only
        filename = os.path.basename(file_path)
        
        print(f"{i}. {filename}")
        print(f"   Size: {file_size} bytes ({file_size/1024:.1f} KB)")
        print(f"   Modified: {mod_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print()

if __name__ == "__main__":
    list_saved_audio_files()