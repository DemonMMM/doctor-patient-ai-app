#!/usr/bin/env bash
set -euo pipefail
npx esbuild public/app.jsx \
  --bundle \
  --outfile=public/app.bundle.js \
  --loader:.jsx=jsx \
  --jsx-factory=React.createElement \
  --jsx-fragment=React.Fragment \
  --target=es2019
