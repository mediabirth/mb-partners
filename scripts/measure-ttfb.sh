#!/bin/bash
# Usage: bash scripts/measure-ttfb.sh [base_url]
BASE="${1:-https://mb-partners.app}"
echo "=== TTFB Baseline: $BASE ==="
for path in /login /console /console/deals /console/services /console/partners /app /api/health; do
  times=()
  for i in 1 2 3 4 5; do
    t=$(/usr/bin/curl -s -o /dev/null -w "%{time_starttransfer}" "$BASE$path")
    # Convert to ms using bc
    ms=$(echo "$t * 1000" | /usr/bin/bc | /usr/bin/cut -d. -f1)
    times+=("$ms")
  done
  # Average
  sum=0
  for ms in "${times[@]}"; do sum=$((sum + ms)); done
  avg=$((sum / 5))
  echo "  $path: ${times[0]} ${times[1]} ${times[2]} ${times[3]} ${times[4]} → avg ${avg}ms"
done
