/**
 * generate-icon.js — Clarity icon generator
 *
 * How to regenerate icon-180.png (Apple Touch Icon) using ImageMagick:
 *
 *   convert -size 180x180 \
 *     gradient:"#7c3aed-#a78bfa" \
 *     -font /usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf \
 *     -pointsize 85 \
 *     -fill white \
 *     -gravity center \
 *     -annotate 0 "C." \
 *     icon-180.png
 *
 * For icon-192.png and icon-512.png, change -size accordingly:
 *   convert -size 192x192 gradient:"#7c3aed-#a78bfa" ... icon-192.png
 *   convert -size 512x512 -pointsize 240 gradient:"#7c3aed-#a78bfa" ... icon-512.png
 *
 * If using Node.js canvas (npm install canvas):
 *
 *   const { createCanvas } = require('canvas');
 *   const fs = require('fs');
 *   const canvas = createCanvas(180, 180);
 *   const ctx = canvas.getContext('2d');
 *   const grad = ctx.createLinearGradient(0, 0, 180, 180);
 *   grad.addColorStop(0, '#7c3aed');
 *   grad.addColorStop(1, '#a78bfa');
 *   ctx.fillStyle = grad;
 *   ctx.roundRect(0, 0, 180, 180, 40);
 *   ctx.fill();
 *   ctx.fillStyle = 'white';
 *   ctx.font = 'bold 85px Georgia';
 *   ctx.textAlign = 'center';
 *   ctx.textBaseline = 'middle';
 *   ctx.fillText('C.', 90, 95);
 *   fs.writeFileSync('icon-180.png', canvas.toBuffer('image/png'));
 *
 * Source SVG: icon-180.svg (also in this folder)
 */
