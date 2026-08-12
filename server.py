"""
Local web server for the "System Characterization From Data" DIFUSE module.

Serves the student-facing single-page app (static/) and:
  - lists / streams the cart footage videos that ship with the module
    (from ../engineering-analyze-first-order-systems-main/completed_module/data),
  - stores class-wide submitted run parameters (gain, time constant, ...)
    in a small JSON file so the "Class Data" tab can aggregate them,
    the same role the original module's Google Form/Sheet played.

Run with:  python server.py   then open http://127.0.0.1:5050
"""
import datetime
import json
import os
import re
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
VIDEO_DIR = BASE_DIR / "videos" / "Cart Footage"
SUBMISSIONS_FILE = BASE_DIR / "data" / "submissions.json"

app = Flask(__name__, static_folder="static", static_url_path="")

CART_DIR_RE = re.compile(r"^(Cart\d)\s+([\d.]+)V$", re.IGNORECASE)
RUN_RE = re.compile(r"_(\d+)\.(mov|mp4)$", re.IGNORECASE)


# ---------------------------------------------------------------- submissions

def load_submissions():
    if SUBMISSIONS_FILE.exists():
        try:
            return json.loads(SUBMISSIONS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []
    return []


def save_submissions(items):
    SUBMISSIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SUBMISSIONS_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


@app.get("/api/submissions")
def get_submissions():
    return jsonify(load_submissions())


@app.post("/api/submissions")
def post_submission():
    body = request.get_json(force=True, silent=True) or {}
    for field in ("cart", "voltage", "gain", "timeConstant"):
        if body.get(field) in (None, ""):
            return jsonify({"error": f"missing field: {field}"}), 400

    items = load_submissions()
    new_id = max([i.get("id", 0) for i in items], default=0) + 1
    record = {
        "id": new_id,
        "student": str(body.get("student") or "anonymous")[:60],
        "cart": str(body.get("cart"))[:20],
        "voltage": float(body.get("voltage")),
        "gain": float(body.get("gain")),
        "gainUnits": str(body.get("gainUnits", "(m/s)/V"))[:30],
        "timeConstant": float(body.get("timeConstant")),
        "steadyState": float(body.get("steadyState")) if body.get("steadyState") not in (None, "") else None,
        "method": str(body.get("method", ""))[:200],
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }
    items.append(record)
    save_submissions(items)
    return jsonify(record), 201


@app.delete("/api/submissions/<int:sub_id>")
def delete_submission(sub_id):
    items = load_submissions()
    kept = [i for i in items if i.get("id") != sub_id]
    save_submissions(kept)
    return "", 204


# --------------------------------------------------------------------- videos

@app.get("/api/videos")
def api_videos():
    carts = {}
    extras = []

    if VIDEO_DIR.exists():
        for entry in sorted(VIDEO_DIR.iterdir()):
            if entry.is_file() and entry.suffix.lower() in (".mov", ".mp4"):
                rel = entry.relative_to(VIDEO_DIR).as_posix()
                extras.append({"name": entry.name, "url": f"/videos/{rel}"})
            elif entry.is_dir():
                m = CART_DIR_RE.match(entry.name)
                if not m:
                    continue
                cart, voltage = m.group(1), m.group(2)
                files = []
                for f in sorted(entry.iterdir()):
                    if f.is_file() and f.suffix.lower() in (".mov", ".mp4"):
                        rm = RUN_RE.search(f.name)
                        run = rm.group(1) if rm else f.stem
                        rel = f.relative_to(VIDEO_DIR).as_posix()
                        files.append({"run": run, "name": f.name, "url": f"/videos/{rel}"})
                files.sort(key=lambda x: int(x["run"]) if x["run"].isdigit() else 0)
                carts.setdefault(cart, {})[voltage] = files

    return jsonify({"carts": carts, "extras": extras, "videosAvailable": VIDEO_DIR.exists()})


@app.get("/videos/<path:relpath>")
def serve_video(relpath):
    full = (VIDEO_DIR / relpath).resolve()
    try:
        full.relative_to(VIDEO_DIR.resolve())
    except ValueError:
        abort(403)
    if not full.exists() or not full.is_file():
        abort(404)
    return send_from_directory(full.parent, full.name, conditional=True)


# ---------------------------------------------------------------------- pages

@app.get("/")
def index():
    return app.send_static_file("index.html")


if __name__ == "__main__":
    print(f"Video source: {VIDEO_DIR} (exists={VIDEO_DIR.exists()})")
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port, debug=False)
