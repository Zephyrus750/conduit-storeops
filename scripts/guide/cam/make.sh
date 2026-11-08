#!/bin/bash
# The camera for the scanning steps: a pallet with two consolidation labels
# (real Code 128 barcodes of two consols on the demo manifest), filmed as the
# phone focuses on the first, holds, pans to the second and holds there.
# Chromium plays it as the phone's camera (capture.mjs). Needs ffmpeg.
#   bash scripts/guide/cam/make.sh → out/cam/cam.mjpeg
# The app's ZXing reader (phones without a built-in barcode reader, and
# headless Chromium) reads whole rows of the frame and stops at the first
# start pattern it finds, so each hold frames one label only. The label fills
# most of the frame's width: at about 2 px a bar it reads every time.
set -e
cd "$(dirname "$0")/../../.."
OUT=${GUIDE_OUT:-scripts/guide/out}; C="$OUT/cam"
node scripts/guide/cam/labels.mjs
# 15 fps, 26 s: blurred until 1.4 s, label 1 held to 4 s, a 1.6 s pan, label 2 held.
X1=17; X2=549; Y1=144; Y2=150; A=4.0; B=1.6
ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 15 -i "$C/scene.png" -t 26 -vf "scale=1311:1033,crop=w=720:h=720:x='if(lt(t,$A),$X1+4*sin(2.1*t)+2*sin(5.3*t),if(lt(t,$A+$B),$X1+($X2-$X1)*(((t-$A)/$B)*((t-$A)/$B)*(3-2*((t-$A)/$B))),$X2+4*sin(2.3*t)+2*sin(4.9*t)))':y='if(lt(t,$A),$Y1+3*sin(1.7*t+1),if(lt(t,$A+$B),$Y1-10*sin(3.14159*(t-$A)/$B),$Y2+3*sin(1.9*t)))',boxblur=8:2:enable='lt(t,0.9)',boxblur=3:1:enable='between(t,0.9,1.4)',format=yuvj420p" -c:v mjpeg -q:v 2 -f mjpeg "$C/cam.mjpeg"
# Check: a frame from each hold must read, with the app's own reader.
for n in 45 240; do ffmpeg -hide_banner -loglevel error -y -r 15 -f mjpeg -i "$C/cam.mjpeg" -vf "select=eq(n\,$n)" -frames:v 1 "$C/hold-$n.png"; done
node scripts/guide/cam/decode.mjs "$C/hold-45.png" "$C/hold-240.png" | tee "$C/holds.txt"
if grep -q FAIL "$C/holds.txt"; then echo "A hold frame did not read: see $C/holds.txt"; exit 1; fi
echo "camera $C/cam.mjpeg"
