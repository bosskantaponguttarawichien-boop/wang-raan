# =============================================================================
# วางร้าน (Wang-Raan) — Makefile
# รัน: make <target>
# =============================================================================
PYTHON  := python3

.PHONY: help init test lint status dev build e2e e2e-cf contract

help:           ## แสดงคำสั่ง (targets) ทั้งหมด
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

init:           ## ตรวจสอบสภาพแวดล้อมและรัน Harness Initialization
	@./harness/init.sh

status:         ## ตรวจสอบความถูกต้องของ Feature List ใน Harness
	@$(PYTHON) scripts/validate_harness.py

test:           ## รัน Unit Tests ทั้งหมด
	@if [ -f package.json ]; then npm test; else echo "ยังไม่มี package.json กำลังรอการสร้างใน feat-001"; fi

lint:           ## ตรวจสอบ Architectural Boundaries และ Linting
	@./harness/init.sh --check-env-only
	@if [ -d src/core ]; then \
	  if grep -rEn "(import|from)\s+['\"](react|react-dom|zustand|next|@radix-ui)(/[^'\"]*)?['\"]" src/core/ 2>/dev/null; then \
	    echo "❌ ERROR: พบ import UI/React ใน src/core/"; exit 1; \
	  else \
	    echo "✅ Boundary OK: src/core/ เป็น Pure TypeScript"; \
	  fi \
	fi
	@if [ -f package.json ]; then npm run --silent lint && npm run --silent typecheck && echo "✅ ESLint + TypeScript ผ่าน"; fi
	@$(MAKE) --no-print-directory contract

contract:       ## ตรวจรูปแบบสัญญา API (contracts/openapi.yaml) ด้วย Redocly
	@npx --no-install redocly lint contracts/openapi.yaml --config contracts/redocly.yaml --format=summary >/dev/null 2>&1 \
	  && echo "✅ สัญญา API (contracts/openapi.yaml) ผ่าน" \
	  || (npx --no-install redocly lint contracts/openapi.yaml --config contracts/redocly.yaml; exit 1)

dev:            ## เริ่มต้น Development Server
	@if [ -f package.json ]; then npm run dev; else echo "ยังไม่มี package.json กรุณารัน feat-001 ก่อน"; fi

build:          ## สร้าง Production Bundle
	@if [ -f package.json ]; then npm run build; else echo "ยังไม่มี package.json กรุณารัน feat-001 ก่อน"; fi

e2e:            ## รัน E2E + Responsive 6 breakpoints + Accessibility (Playwright + axe, ใช้ Google Chrome ในเครื่อง)
	@if [ -f package.json ]; then npx playwright test; else echo "ยังไม่มี package.json"; fi

e2e-cf:         ## รัน E2E ชุดเดียวกันบน runtime ของ Cloudflare Workers (workerd ผ่าน wrangler dev)
	@E2E_TARGET=cloudflare npx playwright test
