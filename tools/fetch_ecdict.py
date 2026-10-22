"""并行分块下载 ECDICT 词库（GitHub 直链只有 ~4KB/s，走镜像 + 多线程 Range）。

    python tools/fetch_ecdict.py [--workers 8]

目标文件：tools/.cache/ecdict.csv（约 63 MB）。下完跑
    python tools/import_ecdict.py     # 2 分钟，筛出 tag 含 ky 的考研词
"""

from __future__ import annotations

import argparse
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

MIRRORS = [
    "https://ghfast.top/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
    "https://gh-proxy.com/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
    "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
]
EXPECTED = 65_933_428
DEST = Path(__file__).resolve().parent / ".cache" / "ecdict.csv"
PARTS = Path(__file__).resolve().parent / ".cache" / "parts"


def probe(url: str) -> int:
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return int(response.headers.get("Content-Length") or 0)


def fetch_range(url: str, start: int, end: int, target: Path, tag: str) -> None:
    """下载 [start, end] 闭区间，失败重试 3 次。"""
    if target.exists() and target.stat().st_size == end - start + 1:
        print(f"  [{tag}] 已存在，跳过", flush=True)
        return
    for attempt in range(1, 4):
        try:
            request = urllib.request.Request(
                url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "curl/8"}
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                if response.status != 206:
                    raise RuntimeError(f"不支持 Range（{response.status}）")
                content_range = response.headers.get("Content-Range", "")
                if not content_range.startswith(f"bytes {start}-"):
                    raise RuntimeError(f"Range 对不上：{content_range}")
                data = response.read()
            if len(data) != end - start + 1:
                raise RuntimeError(f"长度不对 {len(data)} != {end - start + 1}")
            target.write_bytes(data)
            print(f"  [{tag}] 完成 {len(data) / 1024 / 1024:.1f} MB", flush=True)
            return
        except (urllib.error.URLError, RuntimeError, TimeoutError, OSError) as error:
            print(f"  [{tag}] 重试 {attempt}/3：{error}", flush=True)
            time.sleep(2)
    raise RuntimeError(f"[{tag}] 下载失败")


def download(url: str, workers: int) -> None:
    total = probe(url) or EXPECTED
    print(f"总大小 {total} 字节；{workers} 线程，源 {url.split('/')[2]}", flush=True)
    PARTS.mkdir(parents=True, exist_ok=True)
    step = (total + workers - 1) // workers
    jobs = []
    for index in range(workers):
        start = index * step
        end = min(start + step - 1, total - 1)
        if start > end:
            continue
        jobs.append((start, end, PARTS / f"part-{index:02d}.bin"))

    errors: list[str] = []

    def run(index: int, start: int, end: int, target: Path) -> None:
        try:
            fetch_range(url, start, end, target, f"{index:02d}")
        except RuntimeError as error:
            errors.append(str(error))

    threads = [
        threading.Thread(target=run, args=(index, start, end, target), daemon=True)
        for index, (start, end, target) in enumerate(jobs)
    ]
    started = time.time()
    for index, thread in enumerate(threads):
        # 错开启动，避免同时开连被镜像判成爬虫（ghfast 会回 429）
        time.sleep(1.5 if index else 0)
        thread.start()
    for thread in threads:
        thread.join()
    if errors:
        raise RuntimeError("；".join(errors))

    DEST.parent.mkdir(parents=True, exist_ok=True)
    with DEST.open("wb") as handle:
        for _, _, target in jobs:
            handle.write(target.read_bytes())
    size = DEST.stat().st_size
    print(f"合并完成 {size} 字节，用时 {time.time() - started:.0f} 秒", flush=True)
    if size != total:
        raise RuntimeError(f"大小不符 {size} != {total}")
    for _, _, target in jobs:
        target.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="并行分块下载 ECDICT")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    for url in MIRRORS:
        try:
            download(url, max(1, args.workers))
            return 0
        except Exception as error:  # noqa: BLE001 - 逐个镜像回退
            print(f"源失败，换下一个：{error}", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
