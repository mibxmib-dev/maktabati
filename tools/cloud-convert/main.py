"""home movie: يحوّل حلقات MKV في مجلد المكتبة على Google Drive إلى MP4 في نفس الملف.

حساب البرنامج الآلي ما يقدر ينشئ ملفات جديدة في Drive شخصي (ما له مساحة)،
عشان كذا يرفع الـ MP4 كنسخة جديدة لنفس الملف. الملف يبقى ملك صاحب المكتبة،
ونسخة الـ MKV الأصلية تنحفظ في سجل نسخ الملف (Manage versions) وما تنحذف.
"""
import json, os, subprocess, sys, tempfile, time
import google.auth
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from googleapiclient.errors import HttpError

ROOT = os.environ.get("FOLDER_ID", "")
MAX_FILES = int(os.environ.get("MAX_FILES", "6"))       # كم حلقة في كل تشغيل
ENHANCE = os.environ.get("ENHANCE", "0") == "1"
EXTS = (".mkv", ".avi", ".wmv", ".flv", ".mov", ".ts", ".m2ts", ".mpg", ".mpeg", ".webm", ".vob")

drive = None


def log(*a):
    print(*a, flush=True)


def in_library(file_id, parents, cache={}):
    """يتأكد إن الملف داخل مجلد المكتبة (أو مجلد تحته)."""
    stack = list(parents or [])
    seen = set()
    while stack:
        p = stack.pop()
        if p == ROOT:
            return True
        if p in seen:
            continue
        seen.add(p)
        if p not in cache:
            try:
                cache[p] = drive.files().get(fileId=p, fields="parents", supportsAllDrives=True).execute().get("parents", [])
            except HttpError:
                cache[p] = []
        stack.extend(cache[p])
    return False


def candidates():
    q = "trashed=false and mimeType != 'application/vnd.google-apps.folder'"
    out, token = [], None
    while True:
        r = drive.files().list(q=q, fields="nextPageToken, files(id,name,parents,size,mimeType,appProperties)", pageSize=200,
                               pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        for f in r.get("files", []):
            if (f.get("appProperties") or {}).get("hmConv") == "fail":
                continue
            if f["name"].lower().endswith(EXTS) and in_library(f["id"], f.get("parents")):
                out.append(f)
        token = r.get("nextPageToken")
        if not token:
            return out


def probe(path, sel, entry, fmt="default=noprint_wrappers=1:nokey=1"):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries", entry, "-of", fmt, path],
                       capture_output=True, text=True)
    return r.stdout.strip().splitlines()


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                        "default=noprint_wrappers=1:nokey=1", path], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def convert(src, dst):
    v = (probe(src, "v:0", "stream=codec_name") or [""])[0]
    pix = (probe(src, "v:0", "stream=pix_fmt") or [""])[0]
    langs = probe(src, "a", "stream_tags=language", "csv=p=0")
    ai = next((i for i, l in enumerate(langs) if l.strip() in ("ara", "ar")), 0)
    ac = (probe(src, f"a:{ai}", "stream=codec_name") or [""])[0]
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-map", "0:v:0", "-map", f"0:a:{ai}?",
           "-sn", "-dn", "-map_metadata", "-1"]
    copy = v == "h264" and pix == "yuv420p" and not ENHANCE
    if copy:
        cmd += ["-c:v", "copy"]
    else:
        vf = ["bwdif=mode=send_frame:deint=interlaced", "hqdn3d=1.5:1.5:6:6", "unsharp=5:5:0.6:5:5:0"] if ENHANCE else []
        cmd += ["-vf", ",".join(vf + ["format=yuv420p"]), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-profile:v", "high"]
    cmd += (["-c:a", "copy"] if ac == "aac" else ["-c:a", "aac", "-b:a", "192k", "-ac", "2"])
    cmd += ["-movflags", "+faststart", dst]
    subprocess.run(cmd, check=True)
    return copy


def mark_fail(fid, why):
    log("  FAILED:", why)
    try:
        drive.files().update(fileId=fid, body={"appProperties": {"hmConv": "fail"}}, supportsAllDrives=True).execute()
    except HttpError as e:
        log("  could not mark:", e)


def main():
    global drive
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/drive"])
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    if not ROOT:
        sys.exit("FOLDER_ID is missing")
    todo = candidates()
    log(f"found {len(todo)} file(s) to convert")
    for f in todo[:MAX_FILES]:
        fid, name = f["id"], f["name"]
        log("->", name)
        with tempfile.TemporaryDirectory(dir="/tmp") as d:
            src, dst = os.path.join(d, "in" + os.path.splitext(name)[1]), os.path.join(d, "out.mp4")
            try:
                # نحفظ النسخة الأصلية للأبد في سجل نسخ الملف قبل ما نغيّره
                try:
                    revs = drive.revisions().list(fileId=fid, fields="revisions(id)").execute().get("revisions", [])
                    if revs:
                        drive.revisions().update(fileId=fid, revisionId=revs[-1]["id"], body={"keepForever": True}).execute()
                except HttpError as e:
                    log("  could not pin the original version:", e)
                with open(src, "wb") as fh:
                    dl = MediaIoBaseDownload(fh, drive.files().get_media(fileId=fid, supportsAllDrives=True), chunksize=64 * 1024 * 1024)
                    done = False
                    while not done:
                        _, done = dl.next_chunk(num_retries=5)
                copied = convert(src, dst)
                din, dout = duration(src), duration(dst)
                if dout <= 0 or (din > 0 and abs(din - dout) > 5):
                    mark_fail(fid, f"length mismatch {din:.0f}s vs {dout:.0f}s")
                    continue
                os.remove(src)
                media = MediaFileUpload(dst, mimetype="video/mp4", resumable=True, chunksize=64 * 1024 * 1024)
                req = drive.files().update(fileId=fid, media_body=media, supportsAllDrives=True,
                                           body={"name": os.path.splitext(name)[0] + ".mp4", "mimeType": "video/mp4",
                                                 "appProperties": {"hmConv": "done"}})
                resp = None
                while resp is None:
                    _, resp = req.next_chunk(num_retries=5)
                log("  OK", "(fast copy)" if copied else "(re-encoded)")
            except subprocess.CalledProcessError as e:
                mark_fail(fid, f"ffmpeg error {e.returncode}")
            except HttpError as e:
                log("  Drive error:", e)
                if e.resp.status in (403, 404):
                    mark_fail(fid, "no permission")


if __name__ == "__main__":
    main()
