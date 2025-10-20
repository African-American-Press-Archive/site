#!/bin/bash
#
# Black Press Archive - Incremental Build Script
# Rescans sources, reprocesses incomplete PDFs, and skips converted pages
#

set -e  # Exit on error

YEAR_START=1910
YEAR_END=1929

usage() {
    cat <<EOF
Usage: $0 [--start-year YEAR] [--end-year YEAR]

Optional arguments:
  --start-year, --start_year   First year to process (default: ${YEAR_START})
  --end-year,   --end_year     Last year to process  (default: ${YEAR_END})
  -h, --help                   Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --start-year|--start_year)
            if [[ -n "${2-}" ]]; then
                YEAR_START="$2"
                shift 2
            else
                echo "Error: $1 requires a year argument." >&2
                exit 1
            fi
            ;;
        --end-year|--end_year)
            if [[ -n "${2-}" ]]; then
                YEAR_END="$2"
                shift 2
            else
                echo "Error: $1 requires a year argument." >&2
                exit 1
            fi
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage
            exit 1
            ;;
    esac
done

if [[ ! "${YEAR_START}" =~ ^[0-9]{4}$ ]] || [[ ! "${YEAR_END}" =~ ^[0-9]{4}$ ]]; then
    echo "Error: years must be four-digit numbers. Got start='${YEAR_START}' end='${YEAR_END}'." >&2
    exit 1
fi

if (( YEAR_START > YEAR_END )); then
    echo "Error: start year (${YEAR_START}) cannot be greater than end year (${YEAR_END})." >&2
    exit 1
fi

echo "=========================================="
echo "Black Press Archive - Incremental Build"
echo "Processing years: ${YEAR_START}-${YEAR_END}"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Step 1: Scan PDF directories
echo -e "${BLUE}Step 1/5: Scanning PDF directories...${NC}"
uv run python scan_pdfs.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PDF scan complete${NC}"
else
    echo -e "${RED}✗ PDF scan failed${NC}"
    exit 1
fi
echo ""

# Step 2: Scan JP2 directories
echo -e "${BLUE}Step 2/5: Scanning JP2 directories...${NC}"
uv run python scan_jp2.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ JP2 scan complete${NC}"
else
    echo -e "${RED}✗ JP2 scan failed${NC}"
    exit 1
fi
echo ""

# Step 3: Process PDF papers (rebuild incomplete issues only)
echo -e "${BLUE}Step 3/5: Processing PDF papers...${NC}"
uv run python extract_pages.py --start-year ${YEAR_START} --end-year ${YEAR_END}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PDF processing complete${NC}"
else
    echo -e "${YELLOW}⚠ PDF processing had some errors (continuing...)${NC}"
fi
echo ""

# Step 4: Process JP2 papers (skips pages that already exist)
echo -e "${BLUE}Step 4/5: Processing JP2 papers...${NC}"
uv run python process_jp2.py --start-year ${YEAR_START} --end-year ${YEAR_END}
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ JP2 processing complete${NC}"
else
    echo -e "${YELLOW}⚠ JP2 processing had some errors (continuing...)${NC}"
fi
echo ""

# Step 5: Rebuild unified manifest from all processed issues
echo -e "${BLUE}Step 5/5: Building unified manifest...${NC}"
uv run python merge_manifests.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Manifest build complete${NC}"
else
    echo -e "${RED}✗ Manifest build failed${NC}"
    exit 1
fi
echo ""

# Final summary
echo "=========================================="
echo -e "${GREEN}BUILD COMPLETE!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - PDFs are reprocessed only if pages are missing or outdated"
echo "  - JP2 images skip pages that already exist"
echo "  - Unified manifest created from processed issues"
echo ""
echo "To start the website:"
echo "  python serve.py"
echo ""
echo "Then visit: http://localhost:8000"
echo ""
