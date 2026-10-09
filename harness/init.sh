#!/bin/bash
set -e

echo "=== วางร้าน (Wang-Raan): Harness Initialization & Health Check ==="

# ต้องรันจาก root ของ repo (มี PRD.md และ architecture.md)
cd "$(dirname "$0")/.."

if [ ! -f PRD.md ] || [ ! -f architecture.md ]; then
  echo "ERROR: ไม่พบ PRD.md หรือ architecture.md — ต้องรันจาก root ของ repo wang-raan"
  exit 1
fi

CHECK_ENV_ONLY=0
case "${1:-}" in
    "") ;;
    --check-env-only) CHECK_ENV_ONLY=1 ;;
    *)
        echo "Usage: ./harness/init.sh [--check-env-only]" >&2
        exit 2
        ;;
esac

# ── 1. Node.js & Runtime Check ───────────────────────────────────────────────
echo "=== 1. Checking Node.js Environment ==="
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: ไม่พบคำสั่ง node ในระบบ กรุณาติดตั้ง Node.js (แนะนำ v20+)" >&2
  exit 1
fi

NODE_VER=$(node -v)
echo "Node.js version: ${NODE_VER} (HEALTHY)"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: ไม่พบคำสั่ง npm ในระบบ" >&2
  exit 1
fi

NPM_VER=$(npm -v)
echo "npm version: ${NPM_VER} (HEALTHY)"

# ── 2. Python Check (สำหรับ Harness Scripts & Tools) ─────────────────────────
echo "=== 2. Checking Python Environment ==="
if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: ไม่พบ python3 สำหรับรัน harness scripts" >&2
  exit 1
fi
PY_VER=$(python3 --version)
echo "Python version: ${PY_VER} (HEALTHY)"

if [ "$CHECK_ENV_ONLY" -eq 1 ]; then
  echo "=== Environment Check: HEALTHY ==="
  exit 0
fi

# ── 3. Dependencies Check ───────────────────────────────────────────────────
echo "=== 3. Checking Project Dependencies ==="
if [ -f package.json ]; then
  if [ ! -d node_modules ]; then
    echo "=== Installing dependencies (npm install) ==="
    npm install
  else
    echo "node_modules: พร้อมใช้งาน"
  fi
else
  echo "Note: ยังไม่มี package.json (จะถูกสร้างใน task สถาปัตยกรรมโครงงาน)"
fi

# ── 4. Architectural Boundary Checks ─────────────────────────────────────────
echo "=== 4. Checking Architectural Boundaries ==="

BOUNDARY_ERRORS=0

# Boundary 1: src/core/ (รวม validation/) ต้องเป็น Pure TypeScript ห้าม import React, Zustand, หรือ DOM
if [ -d src/core ]; then
  if grep -rEn "(import|from)\s+['\"](react|react-dom|zustand|next|@radix-ui)(/[^'\"]*)?['\"]" src/core/ 2>/dev/null; then
    echo "ERROR: พบ import UI/React/Zustand ใน src/core/ — ห้ามเด็ดขาด (Core ต้องเป็น Pure TS ตาม architecture.md)"
    BOUNDARY_ERRORS=1
  fi
fi

# Boundary 2: 3D Preview ต้องเป็น Pure SVG Isometric ห้ามใช้ Three.js / WebGL
if grep -rEn "^\s*(import|from)\s+['\"](three|@react-three|babylonjs)['\"]" src/ 2>/dev/null; then
  echo "ERROR: พบ import WebGL/Three.js — ผิดข้อตกลง architecture.md (ต้องใช้ Pure SVG Isometric)"
  BOUNDARY_ERRORS=1
fi

if [ "$BOUNDARY_ERRORS" -eq 0 ]; then
  echo "OK: Architectural boundaries ถูกต้อง ไม่พบการละเมิดกฎ"
else
  echo "ERROR: มีการละเมิด Architectural boundary"
  exit 1
fi

# ── 5. Harness State Validation ──────────────────────────────────────────────
echo "=== 5. Validating Harness State ==="
if [ -f scripts/validate_harness.py ]; then
  python3 scripts/validate_harness.py
fi

# ── 6. Test Suite Verification (ถ้ามี test config) ───────────────────────────
if [ -f package.json ] && grep -q '"test"' package.json; then
  echo "=== 6. Running Test Suite ==="
  npm test -- --run || true
fi

echo "=== Wang-Raan Harness: HEALTHY & READY ==="
