"""Làm sạch bộ rig cắt từ ảnh xem trước (không xoá file gốc).

- Mặt: giữ mảng liền lớn nhất (bỏ chữ chú thích dính trong ảnh gốc), cắt sát, loại mặt bị cụt/quá nhỏ,
  bỏ bản trùng (meme_* trùng face_*) → faces_clean/ + danh sách faces trong rig_data.json.
- Thân: bỏ các mảng rời nhỏ (nền sót lại của ảnh gốc) → bodies_clean/.
- Ô mặt: dò vùng mặt để trống (sáng, liền khối) ở nửa trên thân, lưu face_box = [cx, cy, w] theo tỉ lệ ảnh
  (0–1), để trang studio đặt mặt đúng chỗ bất kể kích thước ảnh.

Chạy: python3 crawled_vatlieuhoathinh/tools/clean_rig_assets.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1] / "rig_assets"
# Mặt đầy đủ, chọn tay sau khi soi cả 130 file (dò tự động nhầm: mặt ảnh chụp cắt vuông trông như "bị cụt",
# còn dải chỉ có mắt lại trông như mặt đủ). meme_* là bản trùng của face_* nên bỏ.
CURATED_FACES = [f"face_a_{i:02d}.png" for i in (1, 2, 3, 4, 5, 11, 12, 13, 14, 15)] + \
    [f"face_b_{i:02d}.png" for i in (1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 31, 32, 33, 34, 35, 36)]

MANUAL_FACE_BOX = {  # không có ô mặt trống (đã có mặt sẵn) hoặc dò nhầm: đặt tay, [cx, cy, w] theo tỉ lệ ảnh
    "bo_panda": [0.47, 0.30, 0.42],
    "gau_vang": [0.50, 0.22, 0.50],
    "ha_nhan": [0.50, 0.20, 0.40],
    "ton_ngo_khong": [0.47, 0.135, 0.22],
    "tru_bat_gioi": [0.47, 0.20, 0.22],
    "sa_tang_dau_da": [0.62, 0.13, 0.24],
}


def alpha(img):
    return np.asarray(img.convert("RGBA"))[:, :, 3] > 24


def keep_components(img, min_share, drop_border=False):
    """Giữ các mảng liền có diện tích ≥ min_share × mảng lớn nhất (drop_border: bỏ mảng phụ chạm mép ảnh)."""
    rgba = np.asarray(img.convert("RGBA")).copy()
    labels, n = ndimage.label(alpha(img), structure=np.ones((3, 3)))
    if n == 0:
        return None, 0, 0
    sizes = ndimage.sum(np.ones_like(labels), labels, index=range(1, n + 1))
    biggest = int(np.argmax(sizes)) + 1
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    keep = [i + 1 for i, s in enumerate(sizes) if s >= min_share * sizes.max()
            and (i + 1 == biggest or not (drop_border and i + 1 in border))]
    mask = np.isin(labels, keep)
    rgba[~mask, 3] = 0
    ys, xs = np.nonzero(mask)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    return Image.fromarray(rgba).crop(box), int(sizes.max()), n


def longest_run(line):
    best = run = 0
    for v in line:
        run = run + 1 if v else 0
        best = max(best, run)
    return best


def cut_edge(img, share):
    """Mảng lớn nhất có đoạn liền trên biên ảnh dài ≥ share × bề ngang/cao của nó → bị cắt."""
    labels, n = ndimage.label(alpha(img), structure=np.ones((3, 3)))
    if n == 0:
        return True
    sizes = ndimage.sum(np.ones_like(labels), labels, index=range(1, n + 1))
    m = labels == int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(m)
    w, h = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    return (longest_run(m[0]) >= share * w or longest_run(m[-1]) >= share * w
            or longest_run(m[:, 0]) >= share * h or longest_run(m[:, -1]) >= share * h)


def dhash(img, size=8):
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    return (a[:, 1:] > a[:, :-1]).flatten()


def clean_faces(data):
    out = ROOT / "faces_clean"
    out.mkdir(exist_ok=True)
    kept, hashes, report = [], [], {"kept": 0, "too_small": [], "cut": [], "duplicate": [], "test": []}
    for item in data["faces"]:
        name = item["file"]
        if name.startswith("test_"):
            report["test"].append(name)
            continue
        if name not in CURATED_FACES:
            report.setdefault("not_curated", []).append(name)
            continue
        src = Image.open(ROOT / "faces" / name).convert("RGBA")
        face, largest, _ = keep_components(src, 0.35)  # chữ là nét nhỏ rời → bị bỏ
        if face is None or largest < 0.12 * src.width * src.height or min(face.size) < 24:
            report["too_small"].append(name)
            continue
        # cụt: khi tách từ ảnh xem trước, mặt bị cắt để lại một MÉP THẲNG dọc biên ảnh. Mặt đầy đủ chỉ
        # chạm biên ở vài điểm (cằm, trán tròn), nên đo độ dài đoạn liền trên mỗi biên của mảng mặt.
        # (cut_edge chỉ để tham khảo: mặt ảnh chụp cắt vuông vẫn dùng được nên không loại theo luật này)
        h = dhash(face)
        if any((h != other).sum() <= 6 for other in hashes):
            report["duplicate"].append(name)
            continue
        hashes.append(h)
        face.save(out / name)
        kept.append({"id": name, "file": name})
    report["kept"] = len(kept)
    return kept, report


def face_box(img):
    """Ô mặt trống: vùng sáng liền khối lớn nhất trong 45% trên của ảnh."""
    rgba = np.asarray(img.convert("RGBA")).astype(np.int16)
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]
    light = (a > 200) & (r > 205) & (g > 190) & (b > 170) & (np.abs(r - g) < 40)
    light[int(img.height * 0.45):, :] = False
    labels, n = ndimage.label(light)
    if n == 0:
        return None
    sizes = ndimage.sum(light, labels, index=range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    if sizes[k - 1] < 0.004 * img.width * img.height:
        return None
    ys, xs = np.nonzero(labels == k)
    return [round(float(xs.mean()) / img.width, 4), round(float(ys.mean()) / img.height, 4),
            round(float(xs.max() - xs.min() + 1) / img.width, 4)]


def clear_white_border(img):
    """Xoá nền trắng nối với mép ảnh, nhưng giữ vùng trắng khép kín bên trong nhân vật."""
    rgba = np.asarray(img.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    near_white = (rgb.min(axis=2) >= 245) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= 10)
    labels, n = ndimage.label(near_white, structure=np.ones((3, 3)))
    if n == 0:
        return Image.fromarray(rgba)
    border_labels = set(np.unique(np.concatenate([
        labels[0], labels[-1], labels[:, 0], labels[:, -1]
    ]))) - {0}
    if border_labels:
        rgba[np.isin(labels, list(border_labels)), 3] = 0
    return Image.fromarray(rgba)


def clean_bodies(data):
    out = ROOT / "bodies_clean"
    out.mkdir(exist_ok=True)
    report = {}
    for c in data["characters"]:
        src = clear_white_border(Image.open(ROOT / c["body_img"]).convert("RGBA"))
        body, _, parts = keep_components(src, 0.05, drop_border=True)  # nền sót: mảng rời nhỏ hoặc chạm mép ảnh
        name = Path(c["body_img"]).name
        body.save(out / name)
        c["body_clean"] = f"bodies_clean/{name}"
        c["face_box"] = MANUAL_FACE_BOX.get(c["id"]) or face_box(body) or [0.5, 0.2, 0.4]
        c["face_box_source"] = "manual" if c["id"] in MANUAL_FACE_BOX else "detected"
        report[c["id"]] = {"parts_before": parts, "size": body.size, "face_box": c["face_box"]}
    return report


def add_local_images():
    """Catalog: thêm local_images (ảnh đã tải về trong thư mục gói) để trang studio không hotlink CDN của shop."""
    base = ROOT.parent
    path = base / "vatlieuhoathinh_catalog.json"
    items = json.loads(path.read_text(encoding="utf-8"))
    for p in items:
        folder = base / p["the_loai"] / p["slug"]
        p["local_images"] = sorted(f"{p['the_loai']}/{p['slug']}/{f.name}" for f in folder.glob("image_*") if f.is_file())
    path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return sum(1 for p in items if p["local_images"]), len(items)


def main():
    path = ROOT / "rig_data.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data.setdefault("faces_raw", data["faces"])
    data["faces"] = data["faces_raw"]
    kept, face_report = clean_faces(data)
    data["faces_clean"] = kept
    body_report = clean_bodies(data)
    ids = {f["file"] for f in kept}
    for c in data["characters"]:
        if c.get("default_face") not in ids:
            c["default_face"] = kept[0]["file"]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    with_local, total = add_local_images()
    print(json.dumps({"catalog_local_images": f"{with_local}/{total}",
                      "faces": {k: (v if isinstance(v, int) else len(v)) for k, v in face_report.items()},
                      "bodies": body_report}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
