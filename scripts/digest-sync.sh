#!/bin/bash
# digest-sync.sh — Bidirectional sync between Desktop and repo digest folders
# Usage: ./digest-sync.sh start   (run in background)
#        ./digest-sync.sh stop    (kill background watchers)
#        ./digest-sync.sh status  (check if running)
#        ./digest-sync.sh once    (one-time sync, no watching)

PIDFILE="/tmp/digest-sync.pid"

# Source and destination pairs
DESKTOP_DAILY="/Users/kurtishatcher/Desktop/_Claude_AI_docs/_Projects/AI_Product_Development/Building Your Virtual Team of 50/05 Daily Digest"
REPO_DAILY="/Users/kurtishatcher/intelligence-dashboard/scripts/digests/daily"

DESKTOP_INFO="/Users/kurtishatcher/Desktop/_Claude_AI_docs/_Projects/AI_Product_Development/Building Your Virtual Team of 50/05 Information Digest"
REPO_INFO="/Users/kurtishatcher/intelligence-dashboard/scripts/digests/information"

# Files to sync (code + config only, not runtime artifacts)
SYNC_FILES=(
    "morning_digest.py"
    "requirements.txt"
    ".env"
    ".env.example"
    "CLAUDE.md"
    "TASKS.md"
)

LOCK="/tmp/digest-sync.lock"

sync_file() {
    local src="$1"
    local dst="$2"
    local file="$3"

    # Skip if source doesn't exist
    [[ ! -f "$src/$file" ]] && return

    # Skip if destination is identical
    if [[ -f "$dst/$file" ]] && cmp -s "$src/$file" "$dst/$file"; then
        return
    fi

    # Prevent re-entrant sync (change triggers watch triggers change)
    if [[ -f "$LOCK" ]]; then
        return
    fi
    touch "$LOCK"

    if cp "$src/$file" "$dst/$file" 2>/dev/null; then
        echo "[$(date '+%H:%M:%S')] Synced: $file  ($src → $dst)"
    fi

    rm -f "$LOCK"
}

sync_all() {
    local src="$1"
    local dst="$2"
    for file in "${SYNC_FILES[@]}"; do
        sync_file "$src" "$dst" "$file"
    done
}

do_once() {
    echo "=== One-time sync ==="

    # For each pair, sync newer → older per file
    for file in "${SYNC_FILES[@]}"; do
        for pair in "DESKTOP_DAILY:REPO_DAILY" "DESKTOP_INFO:REPO_INFO"; do
            IFS=':' read -r src_var dst_var <<< "$pair"
            src="${!src_var}"
            dst="${!dst_var}"

            [[ ! -f "$src/$file" ]] && continue
            [[ ! -f "$dst/$file" ]] && { cp "$src/$file" "$dst/$file"; echo "  Copied $file → $dst_var"; continue; }

            if [[ "$src/$file" -nt "$dst/$file" ]]; then
                cp "$src/$file" "$dst/$file"
                echo "  $file: $src_var → $dst_var (newer)"
            elif [[ "$dst/$file" -nt "$src/$file" ]]; then
                cp "$dst/$file" "$src/$file"
                echo "  $file: $dst_var → $src_var (newer)"
            fi
        done
    done
    echo "Done."
}

watch_dir() {
    local src="$1"
    local dst="$2"
    local label="$3"

    fswatch -0 --event Created --event Updated --event Renamed \
        "$src" 2>/dev/null | while IFS= read -r -d '' changed; do
        filename=$(basename "$changed")
        for file in "${SYNC_FILES[@]}"; do
            if [[ "$filename" == "$file" ]]; then
                sync_file "$src" "$dst" "$file"
                break
            fi
        done
    done &
    echo "$!" >> "$PIDFILE"
    echo "  Watching $label"
}

do_start() {
    if [[ -f "$PIDFILE" ]] && kill -0 $(head -1 "$PIDFILE") 2>/dev/null; then
        echo "Sync already running. Use 'stop' first."
        exit 1
    fi

    echo "=== Starting digest sync ==="

    # Initial sync (newer wins)
    do_once

    # Watch all four directions
    > "$PIDFILE"
    watch_dir "$DESKTOP_DAILY" "$REPO_DAILY" "Desktop Daily → Repo"
    watch_dir "$REPO_DAILY" "$DESKTOP_DAILY" "Repo → Desktop Daily"
    watch_dir "$DESKTOP_INFO" "$REPO_INFO" "Desktop Info → Repo"
    watch_dir "$REPO_INFO" "$DESKTOP_INFO" "Repo → Desktop Info"

    echo ""
    echo "Sync running (PIDs: $(cat "$PIDFILE" | tr '\n' ' '))"
    echo "Stop with: $0 stop"

    # If launched by launchd, keep parent alive so the agent doesn't exit
    if [[ "${LAUNCHED_BY_LAUNCHD:-}" == "1" ]]; then
        wait
    fi
}

do_stop() {
    if [[ ! -f "$PIDFILE" ]]; then
        echo "No sync running."
        exit 0
    fi

    while read -r pid; do
        kill "$pid" 2>/dev/null
    done < "$PIDFILE"

    rm -f "$PIDFILE" "$LOCK"
    echo "Sync stopped."
}

do_status() {
    if [[ -f "$PIDFILE" ]] && kill -0 $(head -1 "$PIDFILE") 2>/dev/null; then
        echo "Sync running (PIDs: $(cat "$PIDFILE" | tr '\n' ' '))"
    else
        echo "Sync not running."
        rm -f "$PIDFILE"
    fi
}

case "${1:-}" in
    start)  do_start ;;
    stop)   do_stop ;;
    status) do_status ;;
    once)   do_once ;;
    *)
        echo "Usage: $0 {start|stop|status|once}"
        echo "  start  — sync now + watch for changes"
        echo "  stop   — stop watching"
        echo "  status — check if running"
        echo "  once   — one-time sync (newer wins), no watching"
        exit 1
        ;;
esac
