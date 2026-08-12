# System Characterization From Data — Cart Lab (student web app)

A self-contained web app for the DIFUSE "System Characterization From Data" module
(`../engineering-analyze-first-order-systems-main`). Students use it to work through
all four parts of the assignment in one place: browse/track the cart footage, turn
position data into velocity and fitted parameters, save and submit their results,
see the aggregated class data, and answer the worksheet.

## Run it locally

```bash
pip install -r requirements.txt
python server.py
```

Then open http://127.0.0.1:5050 . To let a whole class share one "Class Data" pool,
run this on a machine reachable by all students (e.g. an instructor's laptop on the
classroom network) and have everyone open `http://<that machine's IP>:5050`.

## Deploy to Render

This folder is a self-contained deployable unit — the cart-footage videos live in
`webapp/videos/`, so the whole app ships as one repo. `requirements.txt`, `Procfile`,
and `render.yaml` are already set up for it.

1. **Push this `webapp/` folder to its own GitHub repo** (it's ~510MB because of the
   videos, so the initial push will take a few minutes on a normal connection):
   ```bash
   cd webapp
   git init
   git add .
   git commit -m "Cart system-ID lab web app"
   git branch -M main
   git remote add origin <your-empty-github-repo-url>
   git push -u origin main
   ```
2. **In Render**: New → Blueprint → connect that repo. Render will read `render.yaml`
   automatically (build: `pip install -r requirements.txt`, start: `gunicorn server:app
   --bind 0.0.0.0:$PORT ...`). Alternatively, New → Web Service → connect the repo and
   fill in the same build/start commands by hand if you'd rather not use a Blueprint.
3. Pick a plan. `render.yaml` defaults to `starter`; free web services aren't offered
   on all Render accounts, so adjust the plan in the dashboard (or in `render.yaml`)
   to whatever you have available. Given the video volume, avoid the smallest/free
   tiers if you can — the app needs enough disk to hold the ~510MB image and enough
   bandwidth for students streaming video.
4. Deploy. First build will take a while (pulling ~510MB from git). Once live, share
   the Render URL with students in place of `127.0.0.1:5050`.

**Persistence note:** class submissions (`webapp/data/submissions.json`) live on the
service's local disk, which Render wipes on every redeploy and on some restarts —
by design here, since no persistent disk is attached. That's fine for a demo or a
single class session, but if you need the class-data pool to survive redeploys
across a term, add a small Render persistent disk mounted at `webapp/data` and I can
wire that up.

## What it does

- **Overview** — the module objective and the first-order model (`Km`, `T`).
- **Videos** — streams the 68 bundled cart-footage clips (from `webapp/videos/`)
  grouped by cart and voltage, plus the Cart 1/Cart 2 comparison clip used in Part 3.
- **Track** — an in-browser point tracker (calibrate a known length, set an axis
  along the direction of travel, click the target frame-by-frame) that replicates
  the desktop Tracker-software workflow directly against the video, without
  installing anything. Students who used the real Tracker app can instead upload
  its exported `.txt` in **Analyze**.
- **Analyze** — numerical derivative of position → velocity (matching the
  assignment's MATLAB approach), steady-state velocity, DC gain, and time constant
  via both the 63.2%-crossing method and an exponential curve fit, with charts.
- **My Results** — saved runs per cart, a linearity check (vss vs. Vin), a
  5V-response prediction overlaid on real data, and submission to the shared
  class pool.
- **Class Data** — aggregated submissions from everyone using the same server:
  scatter plots, per-group mean/stdev, and outlier flags.
- **Worksheet** — all of the assignment's numbered questions with autosaving
  answers and a plain-text report export for Canvas.

## Notes

- Class submissions persist to `webapp/data/submissions.json` on the server.
- Per-student progress (assignment, tracked points, saved results, worksheet
  answers) lives in that student's browser `localStorage` — it is not sent to
  the server until they click "Submit my runs".
- No build step; it's plain HTML/CSS/JS served by a small Flask app.
