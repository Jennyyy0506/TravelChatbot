
import csv
import math
import argparse
from pathlib import Path

import firebase_admin
from firebase_admin import firestore

# 1. Đường dẫn theo cấu trúc Đồ án 2
BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR.parent / "Data" / "travel_destinations_final.csv"

COLLECTION_NAME = "destinations"
BATCH_SIZE = 100


def load_destinations():
    if not CSV_PATH.is_file():
        raise FileNotFoundError(f"Không tìm thấy CSV: {CSV_PATH}")

    destinations = []
    used_ids = set()

    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        if not reader.fieldnames:
            raise ValueError("CSV không có tiêu đề cột.")

        reader.fieldnames = [name.strip() for name in reader.fieldnames]

        required = {"destination_id", "name", "latitude", "longitude"}
        missing = required - set(reader.fieldnames)

        if missing:
            raise ValueError(f"CSV thiếu các cột: {missing}")

        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"Dòng {line_number} có thừa cột.")

            # Giữ nguyên tên các trường CSV
            data = {
                key: value.strip() if value and value.strip() else None
                for key, value in row.items()
            }

            doc_id = data["destination_id"]

            if not doc_id or not data["name"]:
                raise ValueError(f"Dòng {line_number} thiếu ID hoặc tên.")

            if "/" in doc_id or doc_id in (".", ".."):
                raise ValueError(f"Document ID không hợp lệ: {doc_id}")

            if doc_id in used_ids:
                raise ValueError(f"ID bị trùng: {doc_id}")

            used_ids.add(doc_id)

            # Chuyển tọa độ sang kiểu số
            for field, min_value, max_value in (
                ("latitude", -90, 90),
                ("longitude", -180, 180),
            ):
                value = data[field]

                if value is not None:
                    try:
                        number = float(value)
                    except ValueError:
                        raise ValueError(
                            f"Dòng {line_number}: {field} không phải số"
                        )

                    if not math.isfinite(number) or not min_value <= number <= max_value:
                        raise ValueError(
                            f"Dòng {line_number}: {field} ngoài phạm vi"
                        )

                    data[field] = number

            destinations.append((doc_id, data))

    return destinations


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--commit",
        action="store_true",
        help="Thực sự ghi dữ liệu lên Firestore"
    )
    args = parser.parse_args()

    destinations = load_destinations()

    print(f"CSV: {CSV_PATH}")
    print(f"Số địa điểm hợp lệ: {len(destinations)}")

    for doc_id, data in destinations[:3]:
        print(f"  {doc_id}: {data['name']}")

    if len(destinations) != 250:
        print("Lưu ý: Số lượng khác 250. Hãy kiểm tra dataset.")

    # Mặc định chỉ kiểm tra, chưa upload
    if not args.commit:
        print("DRY RUN: Chưa ghi dữ liệu lên Firebase.")
        print("Dùng --commit để bắt đầu import.")
        return

    firebase_admin.initialize_app()
    db = firestore.client()

    collection = db.collection(COLLECTION_NAME)
    batch = db.batch()

    uploaded = 0

    for doc_id, data in destinations:
        reference = collection.document(str(doc_id))

        # Merge để không xóa các trường bổ sung đã có
        batch.set(reference, data, merge=True)
        uploaded += 1

        if uploaded % BATCH_SIZE == 0 or uploaded == len(destinations):
            batch.commit()
            print(f"Đã ghi {uploaded}/{len(destinations)} địa điểm")
            batch = db.batch()

    print("IMPORT THÀNH CÔNG!")


if __name__ == "__main__":
    main()
