# Splash video

Place the owned splash movie at `public/videos/splash.mp4`.

The app uses it with `autoplay`, `muted`, `playsinline`, `loop`, and `preload="metadata"`.
When the file is missing, fails to load, or the user prefers reduced motion,
the official brand poster at `/brand/haku-official.jpg` remains visible.
Do not use performer profile photos as the splash fallback.
