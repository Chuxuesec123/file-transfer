#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""文件互传服务 —— python3 -m http.server 的增强版。

在原生 http.server 的基础上增加：
  * PUT     上传文件（自动创建多级目录）
  * DELETE  删除文件 / 空目录
  * MKCOL   新建目录
  * GET files/__ls__?path=/xxx  返回 JSON 目录列表（页面据此显示大小与修改时间）

所有写操作都限制在 <脚本目录>/files/ 共享目录内，页面自身文件（index.html 等）不会被改动。
响应头 X-Transfer: 1 供页面识别「具备读写能力」。

用法：
    python3 server.py              # 监听 0.0.0.0:8000
    python3 server.py 80           # 监听 0.0.0.0:80（需要 root）
    python3 server.py 8080 --dir /srv/app
"""

from __future__ import annotations

import argparse
import errno
import functools
import json
import os
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

CHUNK = 256 * 1024
SHARE_NAME = "files"      # 与页面约定：共享目录固定为页面同级 files/


class TransferHandler(SimpleHTTPRequestHandler):
    """静态文件 + 上传 / 删除 / 新建目录。"""

    server_version = "FileTransfer/1.0"
    protocol_version = "HTTP/1.1"

    # ------------------------------------------------------------------ 基础
    def end_headers(self):
        self.send_header("X-Transfer", "1")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, status, body=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body and self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.reply(status, body, "application/json; charset=utf-8")

    def _abs(self, decoded_path):
        """把已解码的 URL 路径安全地映射到共享目录内的绝对路径。"""
        parts = [p for p in decoded_path.replace("\\", "/").split("/") if p not in ("", ".", "..")]
        return os.path.join(self.directory, *parts)

    def resolve(self, path=None):
        raw = self.path if path is None else path
        url_path = urllib.parse.urlsplit(raw).path
        return self._abs(urllib.parse.unquote(url_path))

    # ------------------------------------------------------------ 共享目录约束
    def share_root(self):
        return os.path.join(self.directory, SHARE_NAME)

    def in_share(self, target):
        """只有 files/ 内部（含其本身）才允许读写。"""
        root = os.path.realpath(self.share_root())
        real = os.path.realpath(target)
        return real == root or real.startswith(root + os.sep)

    def deny_outside(self):
        return self.send_json({"error": "只能操作共享目录 files/"}, HTTPStatus.FORBIDDEN)

    def drain_body(self):
        """读掉并丢弃请求体，保证 keep-alive 连接上不残留数据。"""
        try:
            remaining = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            return
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, CHUNK))
            if not chunk:
                break
            remaining -= len(chunk)

    # ------------------------------------------------------------ 能力探测
    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Allow", "GET, HEAD, PUT, DELETE, MKCOL, OPTIONS")
        self.end_headers()

    # ------------------------------------------------------------ 目录列表
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        marker = url.path.rfind("/__ls__")
        if marker != -1 and url.path[marker:] in ("/__ls__", "/__ls__/"):
            query = urllib.parse.parse_qs(url.query)
            base = urllib.parse.unquote(url.path[:marker])
            return self.list_json(base, query.get("path", ["/"])[0])
        return super().do_GET()

    def list_json(self, base, path):
        target = self._abs(base + "/" + path)
        if not self.in_share(target):
            return self.deny_outside()
        if not os.path.isdir(target):
            return self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        entries = []
        try:
            with os.scandir(target) as scan:
                for item in scan:
                    try:
                        stat = item.stat()
                    except OSError:
                        continue
                    entries.append({
                        "name": item.name,
                        "is_dir": item.is_dir(),
                        "size": 0 if item.is_dir() else stat.st_size,
                        "mtime": stat.st_mtime,
                    })
        except OSError as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        entries.sort(key=lambda e: (not e["is_dir"], e["name"].lower()))
        return self.send_json({
            "path": path,
            "entries": entries,
            "writable": os.access(target, os.W_OK),
        })

    # ---------------------------------------------------------------- 上传
    def do_PUT(self):
        target = self.resolve()
        if urllib.parse.urlsplit(self.path).path.endswith("/"):
            self.drain_body()
            return self.send_json({"error": "目标是目录，无法写入"}, HTTPStatus.CONFLICT)
        if not self.in_share(target):
            self.drain_body()
            return self.deny_outside()
        if os.path.isdir(target):
            self.drain_body()
            return self.send_json({"error": "目标是目录，无法写入"}, HTTPStatus.CONFLICT)
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self.close_connection = True
            return self.send_json({"error": "Content-Length 不合法"}, HTTPStatus.BAD_REQUEST)

        temp = target + ".part"
        try:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            remaining = length
            with open(temp, "wb") as fh:
                while remaining > 0:
                    chunk = self.rfile.read(min(remaining, CHUNK))
                    if not chunk:
                        break
                    fh.write(chunk)
                    remaining -= len(chunk)
            if remaining > 0:
                os.remove(temp)                       # 传输中断：丢弃半截文件
                self.close_connection = True
                return self.send_json({"error": "上传中断，未写入文件"}, HTTPStatus.BAD_REQUEST)
            os.replace(temp, target)
        except OSError as exc:
            try:
                os.remove(temp)
            except OSError:
                pass
            return self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

        return self.send_json(
            {"ok": True, "name": os.path.basename(target), "size": length},
            HTTPStatus.CREATED,
        )

    # ---------------------------------------------------------------- 删除
    def do_DELETE(self):
        target = self.resolve()
        if not self.in_share(target):
            return self.deny_outside()
        if os.path.realpath(target) == os.path.realpath(self.share_root()):
            return self.send_json({"error": "共享根目录不能删除"}, HTTPStatus.FORBIDDEN)
        if not os.path.exists(target):
            return self.send_json({"error": "文件不存在"}, HTTPStatus.NOT_FOUND)
        try:
            if os.path.isdir(target):
                os.rmdir(target)          # 只删除空目录，避免误删
            else:
                os.remove(target)
        except OSError as exc:
            if exc.errno == errno.ENOTEMPTY:
                return self.send_json({"error": "目录非空，请先删除其中的文件"}, HTTPStatus.CONFLICT)
            return self.send_json({"error": exc.strerror or str(exc)}, HTTPStatus.CONFLICT)
        return self.send_json({"ok": True})

    # ------------------------------------------------------------ 新建目录
    def do_MKCOL(self):
        target = self.resolve()
        if not self.in_share(target):
            return self.deny_outside()
        if os.path.exists(target):
            return self.send_json({"error": "同名文件或目录已存在"}, HTTPStatus.CONFLICT)
        try:
            os.makedirs(target)
        except OSError as exc:
            return self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
        return self.send_json({"ok": True}, HTTPStatus.CREATED)


def main():
    parser = argparse.ArgumentParser(description="文件互传服务（支持上传 / 删除 / 新建文件夹）")
    parser.add_argument("port", nargs="?", type=int, default=8000, help="监听端口，默认 8000")
    parser.add_argument("--bind", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    parser.add_argument("--dir", default=os.path.dirname(os.path.abspath(__file__)),
                        help="站点根目录（需含 index.html，默认脚本所在目录）")
    args = parser.parse_args()

    directory = os.path.abspath(args.dir)
    share = os.path.join(directory, SHARE_NAME)
    os.makedirs(share, exist_ok=True)

    handler = functools.partial(TransferHandler, directory=directory)
    try:
        httpd = ThreadingHTTPServer((args.bind, args.port), handler)
    except OSError as exc:
        raise SystemExit(f"启动失败：{exc}")

    print(f"文件互传已启动 → http://{args.bind}:{args.port}/", flush=True)
    print(f"共享目录：{share}", flush=True)
    print("按 Ctrl+C 停止", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()

