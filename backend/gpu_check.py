import torch

def check_gpu():
    """Check if CUDA is available and print GPU information"""
    if torch.cuda.is_available():
        print(f"CUDA is available")
        print(f"Number of GPUs: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            print(f"GPU {i}: {torch.cuda.get_device_name(i)}")
        print(f"Current GPU: {torch.cuda.current_device()}")
        return True
    else:
        print("CUDA is not available")
        return False

if __name__ == "__main__":
    check_gpu()