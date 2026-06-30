"""
whatsapp_scraper.py

Experimental local WhatsApp Web scraper.

It opens WhatsApp Web in a persistent browser profile, lets you log in normally,
reads visible/history messages from configured group chats, writes WhatsApp
export-style .txt files, and can run parse_chat.py afterwards.

Install once:
  python -m pip install playwright
  python -m playwright install chromium

Copy whatsapp_scraper_config.example.json to whatsapp_scraper_config.json, edit
chat names if needed, then run:
  python whatsapp_scraper.py --config whatsapp_scraper_config.json --once

For periodic syncing:
  python whatsapp_scraper.py --config whatsapp_scraper_config.json

Notes:
  - This is intentionally local and uses your normal WhatsApp Web session.
  - WhatsApp Web markup changes often, so selectors may need maintenance.
  - Only scrape chats you are allowed to access and store.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import subprocess
import sys
import tempfile
import unittest
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, Literal


DateOrder = Literal["DMY", "MDY"]


DEFAULT_CONFIG = "whatsapp_scraper_config.json"
DEFAULT_PROFILE_DIR = ".whatsapp-web-profile"

OUTPUT_GAME_PATTERNS = {
    "queens.txt": re.compile(r"\bQueens\b", re.IGNORECASE),
    "tango.txt": re.compile(r"\bTango\b", re.IGNORECASE),
    "mini.txt": re.compile(r"\bMini\s+Sudoku\b", re.IGNORECASE),
    "zip.txt": re.compile(r"\bZip\b", re.IGNORECASE),
    "patches.txt": re.compile(r"\bPatches\b", re.IGNORECASE),
}

OUTPUT_GAME_DATE_RULES = {
    "queens.txt": (
        re.compile(r"Queens\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)", re.IGNORECASE),
        611,
        date(2026, 1, 1),
    ),
    "tango.txt": (
        re.compile(r"Tango\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)", re.IGNORECASE),
        451,
        date(2026, 1, 1),
    ),
    "mini.txt": (
        re.compile(r"Mini Sudoku\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)", re.IGNORECASE),
        143,
        date(2026, 1, 1),
    ),
    "zip.txt": (
        re.compile(r"Zip\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)", re.IGNORECASE),
        290,
        date(2026, 1, 1),
    ),
    "patches.txt": (
        re.compile(r"Patches\s+(?:#|[Nn][r.]\.?|n\.\u00ba)\s*(\d+)", re.IGNORECASE),
        1,
        date(2026, 3, 18),
    ),
}

EXPORT_LINE_RE = re.compile(
    r"^\[(\d{2}/\d{2}/\d{4}), (\d{2}:\d{2}:\d{2})\] ([^:]+): (.*)$"
)

WEB_PRE_PATTERNS = [
    # Common WhatsApp Web shape: "[12:34, 01/06/2026] Adam: "
    re.compile(
        r"^\[(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?, "
        r"(?P<date>\d{1,2}/\d{1,2}/\d{2,4})\] (?P<sender>.*?):\s*$",
        re.IGNORECASE,
    ),
    # Export-like shape, useful if the browser locale changes:
    re.compile(
        r"^\[(?P<date>\d{1,2}/\d{1,2}/\d{2,4}), "
        r"(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?\] "
        r"(?P<sender>.*?):\s*$",
        re.IGNORECASE,
    ),
    # 12-hour clock variants, for browsers using an English US-ish locale:
    re.compile(
        r"^\[(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?\s*(?P<ampm>[AP]M), "
        r"(?P<date>\d{1,2}/\d{1,2}/\d{2,4})\] (?P<sender>.*?):\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"^\[(?P<date>\d{1,2}/\d{1,2}/\d{2,4}), "
        r"(?P<hour>\d{1,2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?\s*(?P<ampm>[AP]M)\] "
        r"(?P<sender>.*?):\s*$",
        re.IGNORECASE,
    ),
]


@dataclass(frozen=True)
class Message:
    date: str
    time: str
    sender: str
    body: str

    @property
    def key(self) -> tuple[str, str, str, str]:
        return self.date, self.time, self.sender, self.body

    def sort_key(self) -> tuple[datetime, str, str]:
        try:
            when = datetime.strptime(f"{self.date} {self.time}", "%d/%m/%Y %H:%M:%S")
        except ValueError:
            when = datetime.min
        return when, self.sender.casefold(), self.body

    def to_export_text(self) -> str:
        return f"[{self.date}, {self.time}] {self.sender}: {self.body}"


def load_config(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(
            f"Config file not found: {path}\n"
            f"Copy whatsapp_scraper_config.example.json to {DEFAULT_CONFIG} first."
        )
    return json.loads(path.read_text(encoding="utf-8"))


def configured_date_order(config: dict, output_path: Path) -> DateOrder:
    raw_order = (
        config.get("date_order")
        or config.get("date_format")
        or infer_existing_date_order(output_path)
        or "DMY"
    )
    normalized = str(raw_order).upper().replace("/", "")
    if normalized in {"MDY", "MMDDYYYY", "MMDDYY"}:
        return "MDY"
    if normalized in {"DMY", "DDMMYYYY", "DDMMYY"}:
        return "DMY"
    raise SystemExit("date_order must be either 'DMY' or 'MDY'")


def infer_date_order_from_texts(date_texts: Iterable[str]) -> DateOrder | None:
    for date_text in date_texts:
        parts = date_text.split("/")
        if len(parts) != 3:
            continue
        try:
            first, second = int(parts[0].strip()), int(parts[1].strip())
        except ValueError:
            continue
        if first > 12 and second <= 12:
            return "DMY"
        if second > 12 and first <= 12:
            return "MDY"
    return None


def normalise_date(date_text: str, date_order: DateOrder = "DMY") -> str:
    parts = date_text.split("/")
    if len(parts) != 3:
        raise ValueError(f"Unsupported date: {date_text}")
    first, second, year = [p.strip() for p in parts]
    if date_order == "MDY":
        month, day = first, second
    else:
        day, month = first, second
    if len(year) == 2:
        year = f"20{year}"
    return f"{int(day):02d}/{int(month):02d}/{int(year):04d}"


def parse_web_message(pre_text: str, body: str, date_order: DateOrder = "DMY") -> Message | None:
    pre_text = pre_text.strip()
    for pattern in WEB_PRE_PATTERNS:
        match = pattern.match(pre_text)
        if not match:
            continue
        groups = match.groupdict()
        hour = int(groups["hour"])
        if groups.get("ampm"):
            ampm = groups["ampm"].upper()
            if ampm == "PM" and hour != 12:
                hour += 12
            elif ampm == "AM" and hour == 12:
                hour = 0
        second = groups.get("second") or "00"
        visual_time = f"{hour:02d}:{int(groups['minute']):02d}"
        time_text = f"{visual_time}:{int(second):02d}"
        clean_body = cleanup_message_body(body, visual_time=visual_time)
        if not clean_body:
            return None
        return Message(
            date=normalise_date(groups["date"], date_order=date_order),
            time=time_text,
            sender=cleanup_sender(groups["sender"]),
            body=clean_body,
        )
    return None


def cleanup_sender(sender: str) -> str:
    return (
        sender.replace("\u202f", " ")
        .replace("\u202a", "")
        .replace("\u202c", "")
        .replace("\xa0", " ")
        .strip()
        .lstrip("~ ")
        .strip()
    )


def cleanup_message_body(body: str, visual_time: str | None = None) -> str:
    lines = [line.rstrip() for line in body.replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1].strip():
        lines.pop()

    # WhatsApp Web often exposes the visual timestamp as the last text node.
    # Only remove it when it matches the message metadata time; otherwise a
    # score like "0:59" on its own line would be lost.
    if len(lines) > 1 and visual_time:
        last = lines[-1].strip()
        if normalise_clock_text(last) == visual_time:
            lines.pop()

    return "\n".join(lines).strip()


def normalise_clock_text(value: str) -> str | None:
    match = re.fullmatch(r"(\d{1,2}):(\d{2})(?:\s*([AP]M))?", value.strip(), re.IGNORECASE)
    if not match:
        return None
    hour = int(match.group(1))
    if match.group(3):
        ampm = match.group(3).upper()
        if ampm == "PM" and hour != 12:
            hour += 12
        elif ampm == "AM" and hour == 12:
            hour = 0
    return f"{hour:02d}:{int(match.group(2)):02d}"


def infer_existing_date_order(path: Path) -> DateOrder | None:
    if not path.exists():
        return None
    date_texts = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        match = EXPORT_LINE_RE.match(raw_line)
        if match:
            date_texts.append(match.group(1))
    return infer_date_order_from_texts(date_texts)


def normalise_existing_date(date_text: str, fallback_order: DateOrder) -> str:
    order = infer_date_order_from_texts([date_text]) or fallback_order
    return normalise_date(date_text, date_order=order)


def read_existing_messages(path: Path) -> list[Message]:
    if not path.exists():
        return []

    fallback_order = infer_existing_date_order(path) or "DMY"
    messages: list[Message] = []
    current: Message | None = None
    continuation: list[str] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        match = EXPORT_LINE_RE.match(raw_line)
        if match:
            if current is not None:
                messages.append(
                    Message(current.date, current.time, current.sender, "\n".join(continuation))
                )
            date, time_text, sender, body = match.groups()
            date = normalise_existing_date(date, fallback_order)
            current = Message(date, time_text, cleanup_sender(sender), body)
            continuation = [body]
        elif current is not None:
            continuation.append(raw_line)

    if current is not None:
        messages.append(Message(current.date, current.time, current.sender, "\n".join(continuation)))

    return [with_game_date(path, message) for message in messages]


def with_game_date(path: Path, message: Message) -> Message:
    game_date = date_from_game_number(path, message.body)
    if game_date is None:
        return message
    return Message(
        game_date.strftime("%d/%m/%Y"),
        message.time,
        message.sender,
        message.body,
    )


def game_number_from_body(path: Path, body: str) -> int | None:
    rule = OUTPUT_GAME_DATE_RULES.get(path.name)
    if rule is None:
        return None
    pattern, _base_num, _base_date = rule
    match = pattern.search(body)
    if not match:
        return None
    return int(match.group(1))


def date_from_game_number(path: Path, body: str) -> date | None:
    rule = OUTPUT_GAME_DATE_RULES.get(path.name)
    if rule is None:
        return None
    game_number = game_number_from_body(path, body)
    if game_number is None:
        return None
    return date_from_game_number_value(path, game_number)


def date_from_game_number_value(path: Path, game_number: int) -> date | None:
    rule = OUTPUT_GAME_DATE_RULES.get(path.name)
    if rule is None:
        return None
    _pattern, base_num, base_date = rule
    return base_date + timedelta(days=game_number - base_num)


def output_pattern_for(path: Path) -> re.Pattern | None:
    return OUTPUT_GAME_PATTERNS.get(path.name)


def filter_game_messages(messages: Iterable[Message], pattern: re.Pattern | None) -> list[Message]:
    if pattern is None:
        return list(messages)
    return [message for message in messages if pattern.search(message.body)]


def message_date(message: Message) -> date | None:
    try:
        return datetime.strptime(message.date, "%d/%m/%Y").date()
    except ValueError:
        return None


def latest_existing_game_date(path: Path) -> date | None:
    messages = score_messages_for(path, read_existing_messages(path))
    dates = [
        parsed
        for message in messages
        if (parsed := date_from_game_number(path, message.body) or message_date(message)) is not None
    ]
    return max(dates) if dates else None


def scrape_checkpoint_date(path: Path) -> date | None:
    """
    Stop after the latest contiguous export history.

    If existing exports have a puzzle-number gap, keep scrolling until just
    before the earliest missing number. This lets a later sync repair cases
    where WhatsApp Web skipped one loaded day while newer days were saved.
    """
    messages = score_messages_for(path, read_existing_messages(path))
    numbers = sorted({
        game_number
        for message in messages
        if (game_number := game_number_from_body(path, message.body)) is not None
    })
    if not numbers:
        return None

    existing = set(numbers)
    missing = [num for num in range(numbers[0], numbers[-1] + 1) if num not in existing]
    if missing:
        missing_date = date_from_game_number_value(path, missing[0])
        if missing_date is not None:
            return missing_date - timedelta(days=1)

    return latest_existing_game_date(path)


def score_messages_for(path: Path, messages: Iterable[Message]) -> list[Message]:
    return [message for message in messages if date_from_game_number(path, message.body) is not None]


def write_merged_export(path: Path, scraped: Iterable[Message], prune_existing: bool = False) -> tuple[int, int, int]:
    expected_pattern = output_pattern_for(path)
    existing = read_existing_messages(path)
    if prune_existing:
        existing = filter_game_messages(existing, expected_pattern)

    scraped = list(scraped)
    filtered_scraped = filter_game_messages(scraped, expected_pattern)
    skipped = len(scraped) - len(filtered_scraped)

    if scraped and expected_pattern is not None and not filtered_scraped:
        raise RuntimeError(
            f"Scraped {len(scraped)} messages for {path.name}, but none matched the expected game. "
            "The wrong WhatsApp chat may be open, so nothing was written."
        )

    by_key = {message.key: message for message in existing}
    before = len(by_key)

    for message in filtered_scraped:
        by_key[message.key] = message

    merged = sorted(by_key.values(), key=lambda message: message.sort_key())
    text = "\n".join(message.to_export_text() for message in merged)
    if text:
        text += "\n"
    path.write_text(text, encoding="utf-8")

    return len(merged) - before, len(merged), skipped


async def click_first_visible(page, selectors: list[str], timeout_ms: int = 1500) -> bool:
    for selector in selectors:
        try:
            locators = page.locator(selector)
            count = await locators.count()
        except Exception:
            continue
        for index in range(max(1, count)):
            try:
                locator = locators.nth(index)
                await locator.wait_for(state="visible", timeout=timeout_ms)
                await locator.click()
                return True
            except Exception:
                continue
    return False


async def wait_for_whatsapp_ready(page, timeout_ms: int = 300_000) -> None:
    """Wait until WhatsApp Web shows the logged-in app shell."""
    try:
        await page.wait_for_function(
            """
            () => {
              const visible = (el) => !!(
                el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)
              );
              const selectors = [
                '[data-testid="chat-list"]',
                '[aria-label="Chat list"]',
                '[aria-label="Search input textbox"]',
                '[aria-label*="Search"]',
                '[data-pre-plain-text]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]'
              ];
              return selectors.some((selector) =>
                Array.from(document.querySelectorAll(selector)).some(visible)
              );
            }
            """,
            timeout=timeout_ms,
        )
    except Exception as exc:
        debug_dir = Path(".whatsapp-scraper-debug")
        debug_dir.mkdir(exist_ok=True)
        screenshot = debug_dir / "whatsapp-timeout.png"
        html_dump = debug_dir / "whatsapp-timeout.html"
        await page.screenshot(path=str(screenshot), full_page=True)
        html_dump.write_text(await page.content(), encoding="utf-8")
        raise RuntimeError(
            "WhatsApp Web did not reach the logged-in chat UI in time. "
            f"Saved debug files to {debug_dir}/."
        ) from exc


async def fill_first_visible(page, selectors: list[str], value: str, timeout_ms: int = 1500) -> bool:
    for selector in selectors:
        try:
            locators = page.locator(selector)
            count = await locators.count()
        except Exception:
            continue
        for index in range(max(1, count)):
            try:
                locator = locators.nth(index)
                await locator.wait_for(state="visible", timeout=timeout_ms)
                await locator.click()
                await locator.fill(value)
                return True
            except Exception:
                continue
    return False


async def open_chat(page, chat_name: str) -> None:
    await click_first_visible(page, ['button[aria-label="Chats"]'], timeout_ms=1000)

    search_selectors = [
        '[data-testid="chat-list-search-container"] input[type="text"]',
        '[data-testid="chat-list-search-container"] input[aria-label="Search or start a new chat"]',
        '[data-testid="chat-list-search-container"] input[placeholder="Search or start a new chat"]',
        'input[aria-label="Search or start a new chat"]',
        'input[placeholder="Search or start a new chat"]',
        'div[contenteditable="true"][aria-label="Search input textbox"]',
        'div[contenteditable="true"][aria-label*="Search"]',
    ]
    if not await fill_first_visible(page, search_selectors, chat_name, timeout_ms=2500):
        debug_dir = Path(".whatsapp-scraper-debug")
        debug_dir.mkdir(exist_ok=True)
        await page.screenshot(path=str(debug_dir / "search-box-missing.png"), full_page=True)
        (debug_dir / "search-box-missing.html").write_text(
            await page.content(),
            encoding="utf-8",
        )
        raise RuntimeError("Could not find WhatsApp chat-list search box. Is WhatsApp Web loaded?")

    await page.wait_for_timeout(1200)

    try:
        await page.get_by_title(chat_name, exact=True).first.click(timeout=3000)
    except Exception:
        try:
            await page.get_by_text(chat_name, exact=True).first.click(timeout=3000)
        except Exception:
            await page.keyboard.press("Enter")

    await page.wait_for_timeout(1500)

    if not await page.locator('[data-pre-plain-text]').first.is_visible(timeout=5000):
        raise RuntimeError(f"Opened '{chat_name}', but no readable message rows were visible.")


async def scrape_visible_messages(page, date_order: DateOrder = "DMY") -> list[Message]:
    rows = await page.evaluate(
        """
        () => Array.from(document.querySelectorAll('[data-pre-plain-text]')).map((node) => ({
          pre: node.getAttribute('data-pre-plain-text') || '',
          text: node.innerText || node.textContent || ''
        }))
        """
    )
    messages = []
    for row in rows:
        message = parse_web_message(row.get("pre", ""), row.get("text", ""), date_order=date_order)
        if message:
            messages.append(message)
    return messages


async def scroll_chat_up(page) -> None:
    await page.evaluate(
        """
        () => {
          const message = document.querySelector('[data-pre-plain-text]');
          const ancestors = [];
          let node = message;
          while (node && node !== document.body) {
            ancestors.push(node);
            node = node.parentElement;
          }
          const candidates = ancestors
            .concat(Array.from(document.querySelectorAll('[role="application"] div, main div')))
            .filter((el) => el.scrollHeight > el.clientHeight + 400);
          const scroller = candidates.sort((a, b) => {
            const aArea = a.clientWidth * a.clientHeight;
            const bArea = b.clientWidth * b.clientHeight;
            return bArea - aArea;
          })[0];
          if (scroller) {
            scroller.scrollTop = Math.max(0, scroller.scrollTop - Math.floor(scroller.clientHeight * 1.8));
          }
        }
        """
    )
    await page.wait_for_timeout(900)


async def scrape_chat(
    page,
    chat_name: str,
    output_path: Path,
    scrolls: int,
    stop_at_date: date | None = None,
    expected_pattern: re.Pattern | None = None,
    date_order: DateOrder = "DMY",
) -> list[Message]:
    await open_chat(page, chat_name)

    by_key: dict[tuple[str, str, str, str], Message] = {}
    stale_rounds = 0

    for _ in range(max(1, scrolls)):
        visible = await scrape_visible_messages(page, date_order=date_order)
        for message in visible:
            by_key[message.key] = message
        if has_reached_checkpoint(visible, stop_at_date, output_path):
            break

        before = len(by_key)
        await scroll_chat_up(page)
        visible = await scrape_visible_messages(page, date_order=date_order)
        for message in visible:
            by_key[message.key] = message
        if has_reached_checkpoint(visible, stop_at_date, output_path):
            break

        if len(by_key) == before:
            stale_rounds += 1
        else:
            stale_rounds = 0
        if stale_rounds >= 4:
            break

    return sorted(by_key.values(), key=lambda message: message.sort_key())


def has_reached_checkpoint(
    messages: Iterable[Message],
    stop_at_date: date | None,
    output_path: Path,
) -> bool:
    if stop_at_date is None:
        return False
    for message in score_messages_for(output_path, messages):
        parsed = date_from_game_number(output_path, message.body) or message_date(message)
        if parsed is not None and parsed <= stop_at_date:
            return True
    return False


async def run_scrape(config: dict, profile_dir: Path, headless: bool, prune_existing: bool = False) -> None:
    try:
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise SystemExit(
            "Playwright is not installed.\n"
            "Run:\n"
            "  python -m pip install playwright\n"
            "  python -m playwright install chromium"
        ) from exc

    chats = config.get("chats") or {}
    if not chats:
        raise SystemExit("No chats configured. Add a 'chats' object to the scraper config.")

    scrolls = int(config.get("scrolls", 25))

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=headless,
            viewport={"width": 1400, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto("https://web.whatsapp.com/", wait_until="domcontentloaded")
        print("Opened WhatsApp Web. Scan the QR code if this is the first run.")
        await wait_for_whatsapp_ready(page)

        for chat_name, output_file in chats.items():
            print(f"Scraping: {chat_name}")
            output_path = Path(output_file)
            expected_pattern = output_pattern_for(output_path)
            date_order = configured_date_order(config, output_path)
            checkpoint = scrape_checkpoint_date(output_path)
            if checkpoint:
                print(f"  stopping once visible history reaches {checkpoint:%Y-%m-%d}")
            print(f"  reading WhatsApp dates as {date_order}")
            messages = await scrape_chat(
                page,
                chat_name,
                output_path=output_path,
                scrolls=scrolls,
                stop_at_date=checkpoint,
                expected_pattern=expected_pattern,
                date_order=date_order,
            )
            added, total, skipped = write_merged_export(output_path, messages, prune_existing=prune_existing)
            skipped_note = f", skipped {skipped} non-game message(s)" if skipped else ""
            print(f"  saved {output_file}: +{added} new, {total} total{skipped_note}")

        await context.close()


def run_parser(dashboard: str | None) -> None:
    command = [sys.executable, "parse_chat.py"]
    if dashboard:
        command.append(dashboard)
    print("Running parse_chat.py")
    subprocess.run(command, check=True)


def prune_config_outputs(config: dict) -> None:
    chats = config.get("chats") or {}
    for output_file in chats.values():
        path = Path(output_file)
        if output_pattern_for(path) is None:
            continue
        before = len(read_existing_messages(path))
        added, total, skipped = write_merged_export(path, [], prune_existing=True)
        removed = before - total
        print(f"Pruned {path}: removed {removed} wrong-game message(s), {total} kept")


class ScraperSelfTests(unittest.TestCase):
    def test_parse_24_hour_web_message(self):
        message = parse_web_message("[13:08, 06/06/2026] ~ Adam:", "Queens #767 | 0:42\n13:08")
        self.assertEqual(message, Message("06/06/2026", "13:08:00", "Adam", "Queens #767 | 0:42"))

    def test_parse_12_hour_web_message(self):
        message = parse_web_message("[1:08 PM, 6/6/26] Adam:", "Tango #607 | 1:02\n1:08 PM")
        self.assertEqual(message, Message("06/06/2026", "13:08:00", "Adam", "Tango #607 | 1:02"))

    def test_parse_export_like_message(self):
        message = parse_web_message("[06/06/2026, 09:05:07] Evie:", "Zip #447\n0:59")
        self.assertEqual(message, Message("06/06/2026", "09:05:07", "Evie", "Zip #447\n0:59"))

    def test_parse_web_message_supports_mdy_dates(self):
        message = parse_web_message(
            "[9:42 AM, 6/10/26] Evie:",
            "Mini Sudoku #303 | 0:32\n9:42 AM",
            date_order="MDY",
        )
        self.assertEqual(message, Message("10/06/2026", "09:42:00", "Evie", "Mini Sudoku #303 | 0:32"))

    def test_empty_body_is_ignored(self):
        self.assertIsNone(parse_web_message("[09:05, 06/06/2026] Evie:", "\n09:05"))

    def test_existing_multiline_export_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "chat.txt"
            path.write_text(
                "[06/06/2026, 09:05:07] Evie: Zip #447\n"
                "0:59\n"
                "[06/06/2026, 09:06:00] Adam: Zip #447 | 0:48\n",
                encoding="utf-8",
            )
            messages = read_existing_messages(path)
            self.assertEqual(messages[0].body, "Zip #447\n0:59")
            self.assertEqual(messages[1].body, "Zip #447 | 0:48")

    def test_existing_mdy_file_normalises_ambiguous_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mini.txt"
            path.write_text(
                "[05/19/2026, 09:02:00] Anna: Mini Sudoku #281 | 0:43\n"
                "[06/10/2026, 09:42:00] Evie: Mini Sudoku #303 | 0:32\n",
                encoding="utf-8",
            )
            messages = read_existing_messages(path)
            self.assertEqual(messages[0].date, "19/05/2026")
            self.assertEqual(messages[1].date, "10/06/2026")
            self.assertEqual(latest_existing_game_date(path), date(2026, 6, 10))

    def test_write_merged_export_deduplicates_and_sorts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "chat.txt"
            path.write_text("[06/06/2026, 09:06:00] Adam: Zip #447 | 0:48\n", encoding="utf-8")
            added, total, skipped = write_merged_export(
                path,
                [
                    Message("06/06/2026", "09:06:00", "Adam", "Zip #447 | 0:48"),
                    Message("06/06/2026", "09:05:07", "Evie", "Zip #447\n0:59"),
                ],
            )
            self.assertEqual((added, total, skipped), (1, 2, 0))
            self.assertTrue(path.read_text(encoding="utf-8").startswith("[06/06/2026, 09:05:07] Evie"))

    def test_known_output_file_rejects_wrong_game(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mini.txt"
            with self.assertRaises(RuntimeError):
                write_merged_export(path, [Message("06/06/2026", "09:06:00", "Adam", "Tango #607 | 0:48")])

    def test_known_output_file_can_prune_existing_wrong_game(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mini.txt"
            path.write_text(
                "[06/06/2026, 09:06:00] Adam: Tango #607 | 0:48\n"
                "[06/06/2026, 09:07:00] Evie: Mini Sudoku #299 | 0:59\n",
                encoding="utf-8",
            )
            added, total, skipped = write_merged_export(path, [], prune_existing=True)
            self.assertEqual((added, total, skipped), (0, 1, 0))
            self.assertNotIn("Tango", path.read_text(encoding="utf-8"))

    def test_latest_existing_game_date_ignores_wrong_game_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mini.txt"
            path.write_text(
                "[07/06/2026, 09:06:00] Adam: Tango #608 | 0:48\n"
                "[06/06/2026, 09:07:00] Evie: Mini Sudoku #299 | 0:59\n",
                encoding="utf-8",
            )
            self.assertEqual(latest_existing_game_date(path), date(2026, 6, 6))

    def test_game_number_sets_canonical_date(self):
        self.assertEqual(
            date_from_game_number(Path("zip.txt"), "Zip #465 | 0:23"),
            date(2026, 6, 25),
        )
        self.assertEqual(
            date_from_game_number(Path("tango.txt"), "Tango nr. 620 | 0:31"),
            date(2026, 6, 19),
        )

    def test_scrape_checkpoint_scrolls_past_missing_game_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "zip.txt"
            path.write_text(
                "[24/06/2026, 09:06:00] Adam: Zip #464 | 0:11\n"
                "[26/06/2026, 09:07:00] Evie: Zip #466 | 0:12\n"
                "[30/06/2026, 09:08:00] Igor: Zip #470 | 0:09\n",
                encoding="utf-8",
            )
            self.assertEqual(scrape_checkpoint_date(path), date(2026, 6, 24))

    def test_checkpoint_reached_on_or_before_existing_date(self):
        messages = [
            Message("07/06/2026", "09:06:00", "Adam", "Mini Sudoku #300 | 0:48"),
            Message("06/06/2026", "09:07:00", "Evie", "Mini Sudoku #299 | 0:59"),
        ]
        self.assertTrue(
            has_reached_checkpoint(messages, date(2026, 6, 6), Path("mini.txt"))
        )

    def test_checkpoint_ignores_newer_visible_messages(self):
        messages = [Message("07/06/2026", "09:06:00", "Adam", "Mini Sudoku #300 | 0:48")]
        self.assertFalse(
            has_reached_checkpoint(messages, date(2026, 6, 6), Path("mini.txt"))
        )

    def test_checkpoint_ignores_game_banter_without_score_number(self):
        messages = [Message("05/12/2026", "09:06:00", "Adam", "I WON QUEENS")]
        self.assertFalse(
            has_reached_checkpoint(messages, date(2026, 6, 11), Path("queens.txt"))
        )


def run_self_tests() -> None:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ScraperSelfTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)


async def main_async() -> None:
    parser = argparse.ArgumentParser(description="Experimental WhatsApp Web scraper.")
    parser.add_argument("--config", default=DEFAULT_CONFIG, help="Path to scraper JSON config.")
    parser.add_argument("--profile-dir", default=DEFAULT_PROFILE_DIR, help="Persistent browser profile dir.")
    parser.add_argument("--once", action="store_true", help="Scrape once and exit.")
    parser.add_argument("--headless", action="store_true", help="Run browser headless after login is saved.")
    parser.add_argument("--no-parser", action="store_true", help="Do not run parse_chat.py after scraping.")
    parser.add_argument("--self-test", action="store_true", help="Run offline scraper parsing/merge tests.")
    parser.add_argument("--prune-existing", action="store_true", help="Remove existing wrong-game messages from known output files.")
    parser.add_argument("--prune-only", action="store_true", help="Clean known output files without opening WhatsApp Web.")
    args = parser.parse_args()

    if args.self_test:
        run_self_tests()
        return

    config = load_config(Path(args.config))
    if args.prune_only:
        prune_config_outputs(config)
        if bool(config.get("run_parser_after_scrape", True)) and not args.no_parser:
            run_parser(config.get("dashboard"))
        return

    interval = int(config.get("interval_seconds", 300))
    run_parser_after_scrape = bool(config.get("run_parser_after_scrape", True)) and not args.no_parser

    while True:
        started = datetime.now()
        print(f"\nSync started: {started:%Y-%m-%d %H:%M:%S}")
        await run_scrape(config, Path(args.profile_dir), headless=args.headless, prune_existing=args.prune_existing)
        if run_parser_after_scrape:
            run_parser(config.get("dashboard"))
        if args.once:
            break
        print(f"Sleeping {interval} seconds. Press Ctrl+C to stop.")
        await asyncio.sleep(interval)


def main() -> None:
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
