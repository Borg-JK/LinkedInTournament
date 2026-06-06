"""
parse_chat.py
Parses WhatsApp chat txt files for all 5 games and updates the dashboard HTML.

Usage:  python parse_chat.py [path/to/index.html]

If no path is given, looks for index.html in the same directory as this script.

Files expected in the same directory as this script (or CWD):
  queens.txt   tango.txt   mini.txt   zip.txt   patches.txt

Only entries from 2026-01-01 onwards are included.

After updating game data the script also:
  - Injects the latest month (YYYY-MM) into every <select> month dropdown
  - Updates TOURNAMENT_MONTH_DAYS with the correct day-count for that month
"""

import re
import json
import os
import sys
import calendar
from datetime import datetime, timedelta
from collections import defaultdict

# ─────────────────────────────────────────────────────────────────────────────
# Configuration – one entry per game
# ─────────────────────────────────────────────────────────────────────────────
GAMES = {
    "queens": {
        "file":       "queens.txt",
        "js_var":     "QUEENS_DATA",
        "num_key":    "queens_num",
        "time_key":   "queens_time",
        "base_num":   611,
        "base_date":  datetime(2026, 1, 1),
        "pattern":    re.compile(r'Queens\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)[^\d\n]*\|[^\d]*(\d+):(\d{2})', re.IGNORECASE),
        "pattern2":   re.compile(r'Queens\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)\s*\n\s*(\d+):(\d{2})', re.IGNORECASE),
    },
    "tango": {
        "file":       "tango.txt",
        "js_var":     "TANGO_DATA",
        "num_key":    "tango_num",
        "time_key":   "tango_time",
        "base_num":   451,
        "base_date":  datetime(2026, 1, 1),
        "pattern":    re.compile(r'Tango\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)[^\d\n]*\|[^\d]*(\d+):(\d{2})', re.IGNORECASE),
        "pattern2":   re.compile(r'Tango\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)\s*\n\s*(\d+):(\d{2})', re.IGNORECASE),
    },
    "mini": {
        "file":       "mini.txt",
        "js_var":     "MINI_DATA",
        "num_key":    "mini_num",
        "time_key":   "mini_time",
        "base_num":   143,
        "base_date":  datetime(2026, 1, 1),
        "pattern":    re.compile(r'Mini Sudoku\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)[^\d\n]*\|[^\d]*(\d+):(\d{2})', re.IGNORECASE),
        "pattern2":   re.compile(r'Mini Sudoku\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)\s*\n\s*(\d+):(\d{2})', re.IGNORECASE),
    },
    "zip": {
        "file":       "zip.txt",
        "js_var":     "ZIP_DATA",
        "num_key":    "zip_num",
        "time_key":   "zip_time",
        "base_num":   290,
        "base_date":  datetime(2026, 1, 1),
        "pattern":    re.compile(r'Zip\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)[^\d\n]*\|[^\d]*(\d+):(\d{2})', re.IGNORECASE),
        "pattern2":   re.compile(r'Zip\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)\s*\n\s*(\d+):(\d{2})', re.IGNORECASE),
    },
    "patches": {
        "file":       "patches.txt",
        "js_var":     "PATCHES_DATA",
        "num_key":    "patches_num",
        "time_key":   "patches_time",
        "base_num":   1,
        "base_date":  datetime(2026, 3, 18),   # Patches #1 was 18/03/2026
        "pattern":    re.compile(r'Patches\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)[^\d\n]*\|[^\d]*(\d+):(\d{2})', re.IGNORECASE),
        "pattern2":   re.compile(r'Patches\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)\s*\n\s*(\d+):(\d{2})', re.IGNORECASE),
    },
}

START_DATE = datetime(2026, 1, 1)

# Message line pattern  [DD/MM/YYYY, HH:MM:SS] Sender: body
MSG_PAT = re.compile(r'^\[(\d{2}/\d{2}/\d{4}), (\d{2}:\d{2}:\d{2})\] ([^:]+): (.*)$')


# ─────────────────────────────────────────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────────────────────────────────────────
def parse_messages(filepath):
    """Return list of (date_str, time_str, sender, body) from a chat file."""
    if not os.path.exists(filepath):
        print(f"  ⚠  {filepath} not found – skipping")
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.read().split("\n")
    messages = []
    current = None

    for line in lines:
        m = MSG_PAT.match(line.strip())
        if m:
            if current is not None:
                messages.append(current)
            date_str, time_str, sender, body = m.groups()
            current = [date_str, time_str, sender.strip(), body]
        elif current is not None:
            current[3] += "\n" + line.strip()

    if current is not None:
        messages.append(current)

    return messages


def compute_points(by_day_entries):
    """
    Assign points using ex-aequo ranking (athletics-style):
      fastest gets N pts, slowest gets at least 1, ties share the lower rank.
    Returns dict: { person -> { game_num -> points } }
    """
    points = defaultdict(dict)
    for gnum, entries in by_day_entries.items():
        n = len(entries)
        sorted_e = sorted(entries, key=lambda x: x["time_seconds"])
        rank = 1
        i = 0
        while i < n:
            j = i
            while j < n and sorted_e[j]["time_seconds"] == sorted_e[i]["time_seconds"]:
                j += 1
            pts = n - rank + 1
            for e in sorted_e[i:j]:
                points[e["person"]][gnum] = pts
            rank += (j - i)
            i = j
    return points


def parse_game(game_cfg):
    """Parse a single game txt file and return { person: [entries] }."""
    filepath = game_cfg["file"]
    num_key  = game_cfg["num_key"]
    time_key = game_cfg["time_key"]
    base_num = game_cfg["base_num"]
    base_date= game_cfg["base_date"]
    pat      = game_cfg["pattern"]
    pat2     = game_cfg["pattern2"]

    messages = parse_messages(filepath)
    data_by_person = defaultdict(list)

    for date_str, time_str, sender, body in messages:
        try:
            msg_date = datetime.strptime(date_str, "%d/%m/%Y")
        except ValueError:
            continue
        if msg_date < START_DATE:
            continue

        m = pat.search(body) or pat2.search(body)
        if not m:
            continue

        game_num = int(m.group(1))
        mins, secs = int(m.group(2)), int(m.group(3))
        correct_date = base_date + timedelta(days=(game_num - base_num))
        if correct_date < START_DATE:
            continue
        # Strip WhatsApp unicode formatting characters from phone numbers
        clean_name = sender.replace("\u202f", " ").replace("\u202a", "").replace("\u202c", "").replace("\xa0", " ").strip().lstrip("~ ").strip()

        data_by_person[clean_name].append({
            num_key:          game_num,
            "date":           correct_date.strftime("%Y-%m-%d"),
            "day_of_week":    correct_date.strftime("%A"),
            "time_submitted": time_str,
            time_key:         f"{mins}:{secs:02d}",
            "time_seconds":   mins * 60 + secs,
            "person":         clean_name,   # temporary – removed before output
        })

    # Compute points
    # A player can appear more than once for the same puzzle if WhatsApp Web
    # exposes quoted/repeated score text. Keep one result per player/day.
    deduped_by_person = defaultdict(list)
    for person, entries in data_by_person.items():
        best_by_game = {}
        for e in entries:
            game_num = e[num_key]
            current = best_by_game.get(game_num)
            if current is None or (e["time_seconds"], e["time_submitted"]) < (current["time_seconds"], current["time_submitted"]):
                best_by_game[game_num] = e
        deduped_by_person[person] = list(best_by_game.values())
    data_by_person = deduped_by_person

    by_day = defaultdict(list)
    for person, entries in data_by_person.items():
        for e in entries:
            by_day[e[num_key]].append(e)

    pts_lookup = compute_points(by_day)

    # Attach points and remove temp field
    result = {}
    for person, entries in data_by_person.items():
        for e in entries:
            e["points"] = pts_lookup[person].get(e[num_key], 0)
            del e["person"]
        result[person] = sorted(entries, key=lambda x: x[num_key])

    return result


# ─────────────────────────────────────────────────────────────────────────────
# HTML injection
# ─────────────────────────────────────────────────────────────────────────────
def inject_into_html(html, js_var, data):
    """Replace  const JS_VAR = {...};  with new data."""
    new_json = json.dumps(data, ensure_ascii=False)
    pattern = re.compile(
        r"(const " + re.escape(js_var) + r" = )(\{.*?\})(;)",
        re.DOTALL,
    )
    updated, count = pattern.subn(
        lambda m: m.group(1) + new_json + m.group(3),
        html,
        count=1,
    )
    if count == 0:
        print(f"  ⚠  Could not find 'const {js_var}' in HTML – variable not injected")
    return updated


def inject_patches_if_missing(html, data):
    """Insert PATCHES_DATA after ZIP_DATA if it doesn't exist yet."""
    js_var = "PATCHES_DATA"
    if f"const {js_var}" in html:
        return html  # already present

    new_json = json.dumps(data, ensure_ascii=False)
    html = re.sub(
        r"(const ZIP_DATA = \{.*?\};)",
        r"\1\nconst PATCHES_DATA = " + new_json + ";",
        html,
        count=1,
        flags=re.DOTALL,
    )
    print(f"  ➕  Inserted new PATCHES_DATA constant into HTML")
    return html


def get_all_months(all_results):
    """Return all 'YYYY-MM' values found across game results."""
    months = set()
    for result in all_results.values():
        for entries in result.values():
            for e in entries:
                months.add(e["date"][:7])
    return sorted(months)


def month_option(month_str):
    year, mon = int(month_str[:4]), int(month_str[5:])
    label = datetime(year, mon, 1).strftime("%B %Y")
    return f'        <option value="{month_str}">{label}</option>'


def inject_months_into_dropdowns(html, months):
    """
    Rebuild every month <select> that already contains YYYY-MM options.

    Keeps non-month choices such as "All Time" and "Select month", then adds
    every month found in the generated data. This covers the per-game pages,
    tournament page, domination views, and battle views.
    """
    if not months:
        return html

    month_options = "\n".join(month_option(m) for m in months)
    select_pat = re.compile(r'(<select\b[^>]*>)(.*?)(</select>)', re.DOTALL)
    month_value_pat = re.compile(r'<option\b[^>]*value="(?:19|20)\d{2}-\d{2}"[^>]*>.*?</option>\s*', re.DOTALL)

    count = 0
    def replacer(m):
        nonlocal count
        body = m.group(2)
        if not month_value_pat.search(body):
            return m.group(0)
        body_without_months = month_value_pat.sub("", body).rstrip()
        prefix = body_without_months + "\n" if body_without_months.strip() else "\n"
        count += 1
        return m.group(1) + prefix + month_options + "\n      " + m.group(3)

    html = select_pat.sub(replacer, html)
    print(f"  ✓  Synced {count} month dropdown(s) through {months[-1]}")
    return html


def inject_tournament_month_days(html, months, game_results):
    """
    Update TOURNAMENT_MONTH_DAYS in the HTML to include all data months.

    The structure in the HTML is:
        { 'queens': { '2026-01': 31, ... }, 'mini': { ... }, ... }
    i.e. game key is outer, month is inner, value is calendar days in that month.
    """
    import calendar as cal_mod

    if not months:
        return html

    days_by_month = {
        month: cal_mod.monthrange(int(month[:4]), int(month[5:]))[1]
        for month in months
    }

    # Each game line looks like:  'queens':  { '2026-01': 31, '2026-04': 30 },
    def add_month(m):
        line = m.group(0)
        entries = ", ".join(f"'{month}': {days_by_month[month]}" for month in months)
        prefix = re.match(r"'(?:queens|mini|zip|tango|patches)':\s*", line).group(0)
        return prefix + "{ " + entries + " }"

    game_line_pat = re.compile(r"'(?:queens|mini|zip|tango|patches)':\s*\{[^}]+\}")
    updated = game_line_pat.sub(add_month, html)

    if updated == html:
        if all(re.search(r"'(?:queens|mini|zip|tango|patches)':\s*\{[^}]*'" + re.escape(month) + r"'", html) for month in months):
            print(f"  ℹ  TOURNAMENT_MONTH_DAYS already synced through {months[-1]}")
        else:
            print("  ⚠  Could not update TOURNAMENT_MONTH_DAYS")
    else:
        print(f"  ✓  Synced TOURNAMENT_MONTH_DAYS through {months[-1]}")
    return updated


def inject_hall_months(html, months):
    """Update the Hall of Fame month archive list from available data months."""
    if not months:
        return html
    new_list = ", ".join(f"'{m}'" for m in months)
    updated, count = re.subn(
        r"const HALL_MONTHS = \[[^\]]*\];",
        f"const HALL_MONTHS = [{new_list}];",
        html,
        count=1,
        flags=re.DOTALL,
    )
    if count:
        print(f"  ✓  Synced HALL_MONTHS through {months[-1]}")
    else:
        print("  ⚠  Could not find HALL_MONTHS")
    return updated


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
def main():
    # Determine dashboard path
    if len(sys.argv) > 1:
        dashboard = sys.argv[1]
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        dashboard = os.path.join(script_dir, "HTML", "index.html")

    if not os.path.exists(dashboard):
        print(f"✗  index.html not found at: {dashboard}")
        print(f"   Usage: python parse_chat.py [path/to/index.html]")
        return

    print(f"Dashboard: {dashboard}\n")

    with open(dashboard, "r", encoding="utf-8") as f:
        html = f.read()

    total_entries = 0
    all_results = {}

    for game_id, cfg in GAMES.items():
        print(f"Parsing {cfg['file']} …")
        result = parse_game(cfg)
        all_results[game_id] = result

        n = sum(len(v) for v in result.values())
        print(f"  ✓  {n} entries across {len(result)} players")
        total_entries += n

        # Save companion JSON file
        json_file = f"{game_id}_data.json"
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"  ✓  Saved {json_file}")

        js_var = cfg["js_var"]
        if f"const {js_var}" not in html:
            if game_id == "patches":
                html = inject_patches_if_missing(html, result)
            else:
                print(f"  ⚠  {js_var} not found in HTML – skipping injection")
        else:
            html = inject_into_html(html, js_var, result)
            print(f"  ✓  Updated {js_var} in HTML")

    # Inject all available months into dropdowns, tournament day counts, and archives
    months = get_all_months(all_results)
    if months:
        print(f"\nMonths in data: {', '.join(months)}")
        html = inject_months_into_dropdowns(html, months)
        html = inject_tournament_month_days(html, months, all_results)
        html = inject_hall_months(html, months)

    with open(dashboard, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"\n✓  Dashboard updated → {dashboard}  ({total_entries} total entries)")


if __name__ == "__main__":
    main()
