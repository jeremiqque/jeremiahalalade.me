---
title: Pixels
description: Dither any image in your browser. Nothing is uploaded.
live: https://pixels.jeremiahalalade.me/
hero: /assets/work/pixels-tool.jpg
heroAlt: The Pixels tool with its controls on the left and an empty drop area.
heroUrl: pixels.jeremiahalalade.me
tags:
  - Browser tool
  - Creative coding
  - Product design
  - Web development
tools:
  - Next.js
---

## Overview

Pixels is a small browser tool that turns any image into a dithered one. You drop a picture in, pick an algorithm and a two-colour palette, and download the result.

Everything happens in the browser, so the image never leaves your machine. There is no account and nothing to upload.

<a class="visit-btn" href="https://pixels.jeremiahalalade.me/" target="_blank" rel="noopener noreferrer">Visit tool &#8599;</a>

## Challenge

I wanted to dither an image and every tool I found wanted me to upload it somewhere first. For a photo I had not published yet, that felt like the wrong trade.

The tool also had to be fun to push around. Dithering is a look you find by experimenting, so the controls needed to respond straight away, not make you wait.

## Outcome

Pixels does all of the work in the browser. Six algorithms are built in, Floyd-Steinberg, Atkinson, Bayer, Stucki, Burkes and Sierra. Each one scatters its error differently, so the same photo takes on a different character with each.

Threshold, strength and dot size are there to push around, with a two-colour palette you set yourself. Noise, vignette, glitch and chromatic aberration sit on top if you want to ruin it properly.

You can drop, paste or browse an image in, and export at up to 4x. No account, no upload, no waiting.
