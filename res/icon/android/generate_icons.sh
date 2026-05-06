#!/bin/bash
# Script untuk generate icon dari SVG menggunakan ImageMagick
# Jalankan sekali secara lokal jika ingin icon custom
# GitHub Actions akan menggunakan icon placeholder dari SVG

SIZES=(48 72 96 144 192)
for size in "${SIZES[@]}"; do
    convert -background "#714B67" \
            -fill white \
            -font Arial-Bold \
            -pointsize $((size/3)) \
            -gravity center \
            -size ${size}x${size} \
            label:"WU" \
            "icon-${size}.png"
    echo "Generated icon-${size}.png"
done
