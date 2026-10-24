
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

# Khởi tạo Firebase từ biến môi trường
firebase_admin.initialize_app()

# Kết nối Firestore
db = firestore.client()

# Đường dẫn dataset dựa theo cấu trúc project
BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR.parent / "Data" / "travel_destinations_final.csv"

try:
    # Kiểm tra Firebase Firestore
    docs = list(db.collection("users").limit(1).stream())

    print("Firebase Firestore connected successfully!")
    print(f"Users read: {len(docs)}")

    # Kiểm tra đường dẫn CSV
    print(f"Dataset: {DATASET_PATH}")
    print(f"Dataset exists: {DATASET_PATH.is_file()}")

except Exception as e:
    print("Firebase connection failed!")
    print(f"Error: {e}")
