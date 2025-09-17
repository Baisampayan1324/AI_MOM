"""
Script to clean up old audio files from the temp folder
"""
import os
import glob
from datetime import datetime, timedelta

def cleanup_old_audio_files(days_old=7):
    """Remove audio files older than specified days"""
    # Define the temp folder path
    temp_folder = os.path.join(os.path.dirname(__file__), "temp_audio")
    
    # Check if folder exists
    if not os.path.exists(temp_folder):
        print("Temp folder does not exist.")
        return
    
    # Find all webm files
    pattern = os.path.join(temp_folder, "*.webm")
    files = glob.glob(pattern)
    
    # Calculate cutoff date
    cutoff_date = datetime.now() - timedelta(days=days_old)
    deleted_count = 0
    
    print(f"Cleaning up audio files older than {days_old} days:")
    print("=" * 50)
    
    for file_path in files:
        # Check file modification time
        mod_time = datetime.fromtimestamp(os.path.getmtime(file_path))
        
        if mod_time < cutoff_date:
            try:
                os.remove(file_path)
                filename = os.path.basename(file_path)
                print(f"Deleted: {filename} (modified: {mod_time.strftime('%Y-%m-%d %H:%M:%S')})")
                deleted_count += 1
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")
    
    print(f"\nCleanup complete. Deleted {deleted_count} files.")

if __name__ == "__main__":
    cleanup_old_audio_files()