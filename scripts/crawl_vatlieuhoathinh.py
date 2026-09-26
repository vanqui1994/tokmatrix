#!/usr/bin/env python3
"""
Crawler for vatlieuhoathinh.shop
Crawls all products across all 17 pages of https://vatlieuhoathinh.shop/vat-lieu/
Categorizes by 'the-loai' (nhan-vat, vu-khi, anh-nen, bieu-cam, do-vat, hieu-ung, khac)
and downloads all high-resolution preview images.
"""

import os
import sys
import re
import json
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_URL = "https://vatlieuhoathinh.shop"
OUT_DIR = Path("/Users/vfa/Code/SSMATool Tiktok/crawled_vatlieuhoathinh")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
}

def fetch_url(url: str, max_retries: int = 3, timeout: int = 20) -> str:
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                charset = resp.headers.get_content_charset() or "utf-8"
                return resp.read().decode(charset, errors="replace")
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"[!] Lỗi fetch {url}: {e}", file=sys.stderr)
                return ""
            time.sleep(1.5 * (attempt + 1))
    return ""

def download_file(url: str, dest_path: Path, max_retries: int = 3, timeout: int = 30) -> bool:
    if dest_path.exists() and dest_path.stat().st_size > 0:
        return True
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
                if len(data) > 0:
                    dest_path.write_bytes(data)
                    return True
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"[!] Lỗi tải {url} -> {dest_path.name}: {e}", file=sys.stderr)
                return False
            time.sleep(1.0)
    return False

def parse_items_from_listing(html: str) -> list[dict]:
    items = []
    # Pattern to find each product card
    # <article class="post-item item-grid"> ... </article>
    articles = re.findall(r'<article class="post-item item-grid">([\s\S]*?)</article>', html)
    for art in articles:
        # Title and URL
        title_m = re.search(r'<h2 class="entry-title">\s*<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"', art)
        if not title_m:
            continue
        prod_url = title_m.group(1).strip()
        title = title_m.group(2).strip() or re.sub(r'<[^>]+>', '', title_m.group(0)).strip()
        
        # Thumbnail image
        bg_m = re.search(r'data-bg="([^"]+)"', art)
        thumb_url = bg_m.group(1).strip() if bg_m else ""
        if not thumb_url:
            src_m = re.search(r'<img[^>]+src="([^"]+)"', art)
            if src_m:
                thumb_url = src_m.group(1).strip()
                
        # Price
        price_m = re.search(r'<div class="entry-cat-dot"[^>]*>([^<]+)</div>', art)
        price = price_m.group(1).strip() if price_m else ""
        
        # Category (thể loại) & Subject (chủ đề)
        # Badges like <span class="badge" ...>Nhân vật</span> or <a href=".../the-loai/nhan-vat">
        cat_matches = re.findall(r'<a href="https://vatlieuhoathinh\.shop/(the-loai|chu-de)/([^"]+)"[^>]*>\s*<span[^>]*>([^<]+)</span>', art)
        
        the_loai = "khac"
        chu_de = "tat-ca"
        for kind, slug, name in cat_matches:
            if kind == "the-loai":
                the_loai = slug.strip("/ ")
            elif kind == "chu-de":
                chu_de = slug.strip("/ ")
                
        # Description
        desc_m = re.search(r'<div class="entry-desc">([\s\S]*?)</div>', art)
        desc = re.sub(r'<[^>]+>', ' ', desc_m.group(1)).strip() if desc_m else ""
        
        # Sales
        sales_m = re.search(r'Đã bán:\s*(\d+)', art)
        sales = int(sales_m.group(1)) if sales_m else 0
        
        slug = prod_url.rstrip("/").split("/")[-1]
        
        items.append({
            "title": title,
            "url": prod_url,
            "slug": slug,
            "the_loai": the_loai,
            "chu_de": chu_de,
            "price": price,
            "thumb": thumb_url,
            "description": desc,
            "sales": sales
        })
    return items

def parse_product_detail(html: str) -> dict:
    info = {"images": []}
    
    # 1. Images inside post-content
    content_m = re.search(r'<article class="post-content[^"]*"[^>]*>([\s\S]*?)</article>', html)
    if content_m:
        content_html = content_m.group(1)
        for img_src in re.findall(r'<img[^>]+src="([^"]+)"', content_html):
            if not img_src.endswith((".gif", "loading", "icon")):
                info["images"].append(img_src)
                
    # 2. Expandable images in sidebar (usually high resolution detail views!)
    for exp_img in re.findall(r'<img[^>]+class="expandable-image"[^>]+src="([^"]+)"', html):
        info["images"].append(exp_img)
        
    # 3. All cdn.vatlieuhoathinh.com images
    for cdn_img in re.findall(r'(https://cdn\.vatlieuhoathinh\.com/shop/images/[a-zA-Z0-9_\-\.]+\.(?:png|jpg|jpeg|webp))', html):
        info["images"].append(cdn_img)
    for cdn_img in re.findall(r'(https://cdn\.vatlieuhoathinh\.com/cdn/images/[a-zA-Z0-9_\-\.]+\.(?:png|jpg|jpeg|webp))', html):
        info["images"].append(cdn_img)
        
    # Deduplicate while preserving order
    seen = set()
    deduped = []
    for img in info["images"]:
        clean_img = img.split("?")[0]
        if clean_img not in seen:
            seen.add(clean_img)
            deduped.append(clean_img)
    info["images"] = deduped
    
    # Accurate category from article meta if available
    cat_m = re.search(r'<a href="https://vatlieuhoathinh\.shop/the-loai/([^"]+)">\s*Thể loại:\s*([^<]+)</a>', html)
    if cat_m:
        info["the_loai"] = cat_m.group(1).strip()
        info["the_loai_name"] = cat_m.group(2).strip()
        
    chu_de_m = re.search(r'<a href="https://vatlieuhoathinh\.shop/chu-de/([^"]+)">\s*Chủ đề:\s*([^<]+)</a>', html)
    if chu_de_m:
        info["chu_de"] = chu_de_m.group(1).strip()
        info["chu_de_name"] = chu_de_m.group(2).strip()
        
    return info

def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_products = []
    seen_urls = set()
    
    print("=== BẮT ĐẦU QUÉT TẤT CẢ TRANG TRÊN VATLIEUHOATHINH.SHOP ===")
    total_pages = 17
    for page in range(1, total_pages + 1):
        page_url = f"{BASE_URL}/vat-lieu/?page={page}"
        print(f"[+] Đang tải trang {page}/{total_pages}: {page_url}...")
        html = fetch_url(page_url)
        if not html:
            print(f"[-] Không lấy được trang {page}")
            continue
            
        items = parse_items_from_listing(html)
        print(f"    -> Tìm thấy {len(items)} sản phẩm.")
        for it in items:
            if it["url"] not in seen_urls:
                seen_urls.add(it["url"])
                all_products.append(it)
        time.sleep(0.5)

    print(f"\n=> TỔNG CỘNG: Đã quét được {len(all_products)} sản phẩm duy nhất.")
    
    # Detailed scan of each product page
    print("\n=== ĐANG LẤY CHI TIẾT VÀ ẢNH GỐC TỪ TỪNG SẢN PHẨM ===")
    detailed_products = []
    
    def process_product(prod):
        html = fetch_url(prod["url"])
        if html:
            detail = parse_product_detail(html)
            if "the_loai" in detail:
                prod["the_loai"] = detail["the_loai"]
            if "chu_de" in detail:
                prod["chu_de"] = detail["chu_de"]
            
            # Combine images with thumbnail
            all_imgs = []
            if prod.get("thumb") and prod["thumb"] not in all_imgs:
                all_imgs.append(prod["thumb"])
            for img in detail.get("images", []):
                if img not in all_imgs:
                    all_imgs.append(img)
            prod["images"] = all_imgs
        else:
            prod["images"] = [prod["thumb"]] if prod.get("thumb") else []
        return prod

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_product, p): p for p in all_products}
        count = 0
        for fut in as_completed(futures):
            count += 1
            prod = fut.result()
            detailed_products.append(prod)
            if count % 20 == 0 or count == len(all_products):
                print(f"    [Chi tiết] Đã xử lý {count}/{len(all_products)} sản phẩm...")

    # Save master catalog
    catalog_path = OUT_DIR / "vatlieuhoathinh_catalog.json"
    catalog_path.write_text(json.dumps(detailed_products, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✓ Đã lưu danh mục vào: {catalog_path}")

    # Group by category and count
    categories = {}
    total_images = 0
    for p in detailed_products:
        cat = p.get("the_loai") or "khac"
        categories.setdefault(cat, []).append(p)
        total_images += len(p.get("images", []))

    print("\n=== THỐNG KÊ THEO THỂ LOẠI ===")
    for cat, prods in sorted(categories.items()):
        img_count = sum(len(p.get("images", [])) for p in prods)
        print(f" - {cat:<15}: {len(prods):>3} sản phẩm, {img_count:>4} ảnh")
    print(f"Tổng số ảnh cần tải: {total_images} ảnh.")

    # Download images
    print("\n=== BẮT ĐẦU TẢI ẢNH THEO THỂ LOẠI ===")
    download_tasks = []
    for p in detailed_products:
        cat = p.get("the_loai") or "khac"
        prod_slug = p.get("slug") or "unknown"
        folder = OUT_DIR / cat / prod_slug
        folder.mkdir(parents=True, exist_ok=True)
        
        # Save metadata.json inside product folder
        (folder / "metadata.json").write_text(json.dumps(p, ensure_ascii=False, indent=2), encoding="utf-8")
        
        for idx, img_url in enumerate(p.get("images", []), 1):
            ext = img_url.split("?")[0].split(".")[-1].lower()
            if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
                ext = "jpg"
            dest_file = folder / f"image_{idx:02d}.{ext}"
            download_tasks.append((img_url, dest_file))

    print(f"Đang tải {len(download_tasks)} file ảnh song song...")
    success = 0
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(download_file, url, path): (url, path) for url, path in download_tasks}
        for fut in as_completed(futures):
            if fut.result():
                success += 1
            if success % 50 == 0 or success == len(download_tasks):
                print(f"    [Tải ảnh] Đã tải thành công {success}/{len(download_tasks)} ảnh...")

    print(f"\n✓ HOÀN TẤT TẢI: {success}/{len(download_tasks)} ảnh đã lưu vào {OUT_DIR}")

if __name__ == "__main__":
    main()
