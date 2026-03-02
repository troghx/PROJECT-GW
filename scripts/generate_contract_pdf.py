#!/usr/bin/env python
import argparse
import json
import re
from datetime import datetime
from pathlib import Path

import fitz


PLACEHOLDER_CREDITOR_MAX = 36
DATE_FMT_SHORT = "%m/%d/%Y"
REDACT_IMAGE_MODE = getattr(fitz, "PDF_REDACT_IMAGE_NONE", 0)
REDACT_GRAPHICS_MODE = getattr(fitz, "PDF_REDACT_LINE_ART_NONE", 0)
REDACT_TEXT_MODE = getattr(fitz, "PDF_REDACT_TEXT_REMOVE", 0)
TABLE_TOKEN_PATTERN = re.compile(r"^/(CNAME|CACCOUNTNUMBER|CBALANCE|CDATELASTPAYMENT)(\d+)/$")
TABLE_COLUMN_ORDER = ("CNAME", "CACCOUNTNUMBER", "CBALANCE", "CDATELASTPAYMENT")
SIGN_PLACEHOLDER_PATTERN = re.compile(r"sign_(?:applicant|coapp)_\d+")
HARDSHIP_REASON_LABELS = {
    "loss_of_income": "Loss of Income",
    "medical": "Medical Issues",
    "divorce": "Divorce / Separation",
    "inflation": "Inflation / Cost of Living",
    "business_failure": "Business Failure",
    "unexpected_expenses": "Unexpected Expenses",
    "other": "Other",
}


def clean_text(value, max_len=500):
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    return text[:max_len]


def digits_only(value):
    return re.sub(r"\D+", "", str(value or ""))


def format_phone(value):
    digits = digits_only(value)
    if len(digits) == 10:
        return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"
    return clean_text(value, 40)


def format_ssn(value):
    digits = digits_only(value)
    if len(digits) == 9:
        return f"{digits[0:3]}-{digits[3:5]}-{digits[5:9]}"
    return clean_text(value, 11)


def parse_iso_date(value):
    text = clean_text(value, 16)
    if not text:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d")
    except ValueError:
        return None


def format_short_date(value):
    parsed = parse_iso_date(value)
    if parsed:
        return parsed.strftime(DATE_FMT_SHORT)
    return datetime.now().strftime(DATE_FMT_SHORT)


def format_short_date_or_blank(value):
    parsed = parse_iso_date(value)
    if parsed:
        return parsed.strftime(DATE_FMT_SHORT)
    return ""


def format_usd(value):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    if amount < 0:
        amount = 0.0
    return f"${amount:,.2f}"


def format_usd_bare(value):
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        amount = 0.0
    if amount < 0:
        amount = 0.0
    return f"{amount:,.2f}"


def best_phone(lead):
    return (
        clean_text(lead.get("cell_phone"), 40)
        or clean_text(lead.get("home_phone"), 40)
        or clean_text(lead.get("phone"), 40)
    )


def read_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return int(value) == 1
    normalized = clean_text(value, 16).lower()
    if not normalized:
        return False
    return normalized in {"1", "true", "yes", "on"}


def build_city_state_zip(lead):
    city = clean_text(lead.get("city"), 120)
    state_code = clean_text(lead.get("state_code"), 10)
    zip_code = clean_text(lead.get("zip_code"), 12)
    return " ".join([part for part in [city, state_code, zip_code] if part]).strip()


def build_client_address(lead):
    street = clean_text(lead.get("address_street"), 180)
    city_state_zip = build_city_state_zip(lead)
    if street and city_state_zip:
        return f"{street}, {city_state_zip}"
    return street or city_state_zip


def build_replacements(payload):
    lead = payload.get("lead") or {}
    program = payload.get("program") or {}
    creditors = payload.get("creditors") or []
    budget = payload.get("budget") or {}
    banking = payload.get("banking") or {}
    include_coapp = read_bool(lead.get("include_coapp_in_contract"))

    client_name = clean_text(lead.get("full_name"), 120)
    client_dob = format_short_date_or_blank(lead.get("dob"))
    client_ssn = format_ssn(lead.get("ssn"))
    client_street = clean_text(lead.get("address_street"), 180)
    client_city = clean_text(lead.get("city"), 120)
    client_state = clean_text(lead.get("state_code"), 10)
    client_zip = clean_text(lead.get("zip_code"), 12)
    client_city_state_zip = " ".join([part for part in [client_city, client_state, client_zip] if part]).strip()
    client_address = build_client_address(lead)
    client_phone = format_phone(best_phone(lead))
    client_email = clean_text(lead.get("email"), 160)
    co_client_name = clean_text(lead.get("co_applicant_name"), 120) if include_coapp else ""
    co_client_dob = format_short_date_or_blank(lead.get("co_applicant_dob")) if include_coapp else ""
    co_client_ssn = format_ssn(lead.get("co_applicant_ssn")) if include_coapp else ""
    co_client_email = clean_text(lead.get("co_applicant_email"), 160) if include_coapp else ""
    co_client_phone = format_phone(lead.get("co_applicant_phone")) if include_coapp else ""
    co_client_address = client_street if include_coapp else ""
    co_client_city_state_zip = client_city_state_zip if include_coapp else ""
    first_deposit_date = format_short_date_or_blank(lead.get("first_deposit_date"))
    date_short = clean_text(program.get("date_short"), 10) or datetime.now().strftime(DATE_FMT_SHORT)

    name_parts = client_name.split() if client_name else []
    client_first_name = " ".join(name_parts[:-1]) if len(name_parts) > 1 else client_name
    client_last_name = name_parts[-1] if len(name_parts) > 1 else ""
    client_ssn_digits = digits_only(lead.get("ssn"))
    client_ssn_last4 = client_ssn_digits[-4:] if len(client_ssn_digits) >= 4 else ""

    monthly_payment = format_usd(program.get("monthly_payment"))
    total_debt = format_usd(program.get("total_debt_enrolled"))
    settlement_fee = format_usd(program.get("settlement_fee"))
    estimated_settlement = format_usd(program.get("estimated_settlement"))
    total_program_cost = format_usd(program.get("total_program_cost"))
    bank_name = clean_text(banking.get("bank_name"), 120)
    bank_routing_number = clean_text(banking.get("routing_number"), 32)
    bank_account_number = clean_text(banking.get("account_number"), 50)
    bank_account_type_raw = clean_text(banking.get("account_type"), 40)
    bank_account_type_normalized = bank_account_type_raw.lower()
    bank_is_checking = (
        read_bool(banking.get("is_checking"))
        or ("check" in bank_account_type_normalized)
        or ("monet" in bank_account_type_normalized)
    )
    bank_is_savings = (
        read_bool(banking.get("is_savings"))
        or ("sav" in bank_account_type_normalized)
        or ("ahorro" in bank_account_type_normalized)
    )
    bank_is_commercial = read_bool(banking.get("is_commercial"))
    bank_is_personal = read_bool(banking.get("is_personal")) if "is_personal" in banking else (not bank_is_commercial)
    bank_holder_name = clean_text(banking.get("name_on_account"), 120) or client_name
    bank_holder_street = clean_text(banking.get("address"), 180) or client_street
    bank_holder_address2 = clean_text(banking.get("address2"), 180)
    if bank_holder_address2:
        bank_holder_street = " ".join([part for part in [bank_holder_street, bank_holder_address2] if part]).strip()
    bank_holder_city = clean_text(banking.get("city"), 120) or client_city
    bank_holder_state = clean_text(banking.get("state"), 10) or client_state
    bank_holder_zip = clean_text(banking.get("zip_code"), 12) or client_zip
    try:
        bank_initial_amount_value = float(banking.get("initial_payment_amount") or 0)
    except (TypeError, ValueError):
        bank_initial_amount_value = 0.0
    if bank_initial_amount_value < 0:
        bank_initial_amount_value = 0.0
    try:
        program_monthly_payment_value = float(program.get("monthly_payment") or 0)
    except (TypeError, ValueError):
        program_monthly_payment_value = 0.0
    if program_monthly_payment_value < 0:
        program_monthly_payment_value = 0.0
    effective_draft_amount = bank_initial_amount_value if bank_initial_amount_value > 0 else program_monthly_payment_value
    draft_amount_usd = format_usd(effective_draft_amount)
    draft_amount_bare = format_usd_bare(effective_draft_amount)
    hardship = budget.get("hardship") or {}
    hardship_reason_raw = clean_text(hardship.get("hardshipReason"), 120)
    hardship_reason_key = hardship_reason_raw.lower()
    hardship_reason = HARDSHIP_REASON_LABELS.get(hardship_reason_key, hardship_reason_raw.replace("_", " ").strip())
    hardship_reason_es = clean_text(hardship.get("detailedReasonEs"), 2500)
    hardship_reason_en = clean_text(hardship.get("detailedReasonEn"), 2500)

    # --- Placeholders: merge fields del template ---
    placeholders = {
        "/CLIENTFULLNAME/": client_name,
        "/CLIENTDOB/": client_dob,
        "/CLIENTSSN/": client_ssn,
        "/CLIENTADDRESS/": client_address,
        "/CLIENTPHONE/": client_phone,
        "/CLIENTEMAIL/": client_email,
        "/COCLIENTFULLNAME/": co_client_name,
        "/COCLIENTSSN/": co_client_ssn,
        "/COCLIENTEMAIL/": co_client_email,
        "/PROGRAMLENGTH/": clean_text(program.get("program_length"), 8),
        "/MONTHLYPAYMENT/": monthly_payment,
        "/TOTALDEBTENROLLED/": total_debt,
        "/DATESHORT/": date_short,
        "/CLIENTSIGN/": "",
        "/COCLIENTSIGN/": "",
        "/CLIENTINITIALS/": "",
        "/ISFD_______/": "X",
        "/ISFD_______": "X",
        "/ISOT________/": "",
        "/ISOT________": "",
    }

    for idx in range(1, PLACEHOLDER_CREDITOR_MAX + 1):
        row = creditors[idx - 1] if idx - 1 < len(creditors) else {}
        creditor_name = clean_text(row.get("name"), 180)
        account_number = clean_text(row.get("account_number"), 80)
        date_last_payment = clean_text(row.get("date_last_payment"), 24)

        raw_balance = row.get("balance")
        has_explicit_balance = raw_balance not in (None, "")
        has_row_data = bool(creditor_name or account_number or date_last_payment or has_explicit_balance)

        balance_text = format_usd(raw_balance) if has_explicit_balance else ""
        placeholders[f"/CNAME{idx}/"] = creditor_name if has_row_data else ""
        placeholders[f"/CACCOUNTNUMBER{idx}/"] = account_number if has_row_data else ""
        placeholders[f"/CBALANCE{idx}/"] = balance_text if has_row_data else ""
        placeholders[f"/CDATELASTPAYMENT{idx}/"] = date_last_payment if has_row_data else ""

    # --- Legacy: datos demo de Juan Pablo que coexisten con los placeholders ---
    # El valor es lo que se DIBUJA solo si NO hay placeholder cercano.
    budget_expenses = budget.get("expenses") or {}
    budget_income = budget.get("income") or {}
    budget_income_app = budget_income.get("applicant") or {}
    budget_income_coapp = budget_income.get("coapp") or {}
    budget_total_income = budget.get("totalMonthlyIncome", 0)
    budget_total_expenses = budget.get("totalMonthlyExpenses", 0)
    budget_remaining = budget.get("remaining", 0)
    budget_income_app_net = budget_income_app.get("netMonthlyIncome", 0)
    budget_income_coapp_net = budget_income_coapp.get("netMonthlyIncome", 0) if include_coapp else 0

    legacy = {
        # Datos personales (en páginas sin placeholder se dibuja el dato nuevo).
        "Juan Pablo  Rodriguez": client_name,
        "Juan Pablo Rodriguez": client_name,
        "03/16/1990": client_dob,
        "976-96-0105": client_ssn,
        "2557 South St Apt C": client_street,
        "Beaumont,TX, 77702": client_city_state_zip,
        "945-444-9605": client_phone,
        "02/24/2026": date_short,
        # Creditor demo (p3).
        "OPORTUN/PATHWARD": "",
        "6672677": "",
        "01/01/2026": "",
        # Montos financieros del programa demo (resumen p10 y p2).
        "$8,740.00": total_debt,
        "$326.69": draft_amount_usd,
        "326.69": draft_amount_bare,
        "$2,185.00": settlement_fee,
        "$4,807.00": estimated_settlement,
        "$7,840.51": total_program_cost,
        "$5,000.00": format_usd(budget_total_income),
        "$2,480.00": format_usd(budget_total_expenses),
        "$2,193.31": format_usd(budget_remaining),
        # Budget detalle sin $ (pp12-13).
        "5,000.00": format_usd_bare(budget_total_income),
        "2,480.00": format_usd_bare(budget_total_expenses),
        "650.00": format_usd_bare(budget_expenses.get("housing", 0)),
        "1,000.00": format_usd_bare(budget_expenses.get("transportation", 0)),
        "600.00": format_usd_bare(budget_expenses.get("food", 0)),
        "230.00": format_usd_bare(budget_expenses.get("utilities", 0)),
        "2,185.00": format_usd_bare(program.get("settlement_fee", 0)),
        # Fragmentos corruptos del template (row 36).
        "$00,000.00": "",
        "INSCRITAMBER36/": "",
        "CE36/": "",
    }

    # sign_applicant / sign_coapp IDs.
    sign_ids = [
        "1823489", "1953978", "11032953", "11522170", "11789955",
        "12282085", "12344276", "12519089", "12678491", "12715980",
        "12795287", "12818637", "12935624", "13047338", "13182460",
        "13244925", "13556826", "13696914", "13756130", "13826966",
    ]
    for sid in sign_ids:
        legacy[f"sign_applicant_{sid}"] = ""
        legacy[f"sign_coapp_{sid}"] = ""

    render_context = {
        "include_coapp": include_coapp,
        "client_name": client_name,
        "client_phone": client_phone,
        "client_email": client_email,
        "client_street": client_street,
        "client_city": client_city,
        "client_state": client_state,
        "client_zip": client_zip,
        "client_city_state_zip": client_city_state_zip,
        "co_client_name": co_client_name,
        "co_client_dob": co_client_dob,
        "co_client_ssn": co_client_ssn,
        "co_client_address": co_client_address,
        "co_client_city_state_zip": co_client_city_state_zip,
        "co_client_phone": co_client_phone,
        "client_first_name": client_first_name,
        "client_last_name": client_last_name,
        "client_dob": client_dob,
        "client_ssn": client_ssn,
        "client_ssn_last4": client_ssn_last4,
        "date_short": date_short,
        "first_deposit_date": first_deposit_date or date_short,
        "income_applicant_net": format_usd(budget_income_app_net),
        "income_coapp_net": format_usd(budget_income_coapp_net),
        "bank_name": bank_name,
        "bank_routing_number": bank_routing_number,
        "bank_account_number": bank_account_number,
        "bank_is_checking": bank_is_checking,
        "bank_is_savings": bank_is_savings,
        "bank_is_personal": bank_is_personal,
        "bank_is_commercial": bank_is_commercial,
        "bank_holder_name": bank_holder_name,
        "bank_holder_street": bank_holder_street,
        "bank_holder_city": bank_holder_city,
        "bank_holder_state": bank_holder_state,
        "bank_holder_zip": bank_holder_zip,
        "bank_draft_amount_usd": draft_amount_usd,
        "bank_draft_amount_bare": draft_amount_bare,
        "hardship_reason": hardship_reason,
        "hardship_reason_es": hardship_reason_es,
        "hardship_reason_en": hardship_reason_en,
    }

    return placeholders, legacy, render_context


def _median(values, default=0.0):
    numbers = [float(v) for v in values if v is not None]
    if not numbers:
        return float(default)
    numbers.sort()
    mid = len(numbers) // 2
    if len(numbers) % 2:
        return numbers[mid]
    return (numbers[mid - 1] + numbers[mid]) / 2.0


def _truncate_text_to_width(text, width, fontsize):
    if not text:
        return ""
    safe_width = max(float(width), 0.0)
    if safe_width <= 0:
        return ""
    if fitz.get_text_length(text, fontname="helv", fontsize=fontsize) <= safe_width:
        return text

    ellipsis = "..."
    ellipsis_width = fitz.get_text_length(ellipsis, fontname="helv", fontsize=fontsize)
    if ellipsis_width > safe_width:
        return ""

    stripped = text.rstrip()
    while stripped and fitz.get_text_length(f"{stripped}{ellipsis}", fontname="helv", fontsize=fontsize) > safe_width:
        stripped = stripped[:-1].rstrip()
    return f"{stripped}{ellipsis}" if stripped else ""


def _looks_money_like_text(text):
    normalized = str(text or "").strip()
    if not normalized:
        return False
    return bool(re.match(r"^\$?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?$", normalized))


def draw_text_in_rect(
    page,
    rect,
    text,
    preferred_size=None,
    min_size=6.8,
    max_size=10.5,
    left_padding=0.0,
    right_padding=0.0,
    lock_size=False,
):
    text = clean_text(text, 500)
    if not text:
        return

    draw_rect = fitz.Rect(rect)
    draw_rect.x0 += max(float(left_padding), 0.0)
    draw_rect.x1 -= max(float(right_padding), 0.0)
    if draw_rect.width <= 1 or draw_rect.height <= 1:
        return

    if preferred_size is None:
        preferred = min(max(draw_rect.height * 0.9, min_size), max_size)
    else:
        preferred = float(preferred_size)

    fontsize = min(max(preferred, min_size), max_size)
    if not lock_size:
        text_len_at_one = fitz.get_text_length(text, fontname="helv", fontsize=1)
        if text_len_at_one > 0:
            fit_size = draw_rect.width / text_len_at_one
            fontsize = max(min_size, min(fontsize, fit_size, max_size))
            while fontsize > 3.4 and fitz.get_text_length(text, fontname="helv", fontsize=fontsize) > draw_rect.width:
                fontsize -= 0.2
            fontsize = max(fontsize, 3.4)

    rendered = text
    if fitz.get_text_length(rendered, fontname="helv", fontsize=fontsize) > draw_rect.width:
        if lock_size or not _looks_money_like_text(rendered):
            rendered = _truncate_text_to_width(rendered, draw_rect.width, fontsize)
    if not rendered:
        return

    baseline_y = draw_rect.y0 + ((draw_rect.height - fontsize) * 0.72) + fontsize
    page.insert_text(
        fitz.Point(draw_rect.x0, baseline_y),
        rendered,
        fontname="helv",
        fontsize=fontsize,
        color=(0, 0, 0),
    )


def _wrap_text_lines(text, width, fontsize):
    normalized = clean_text(text, 5000).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    lines = []
    paragraphs = normalized.split("\n")
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if fitz.get_text_length(candidate, fontname="helv", fontsize=fontsize) <= width:
                current = candidate
                continue
            if current:
                lines.append(current)
                current = word
            else:
                lines.append(_truncate_text_to_width(word, width, fontsize))
                current = ""
        if current:
            lines.append(current)
    return lines


def draw_multiline_text_in_rect(
    page,
    rect,
    text,
    preferred_size=10.0,
    min_size=7.6,
    max_size=11.2,
    left_padding=0.0,
    right_padding=0.0,
    top_padding=0.0,
    line_height=1.2,
):
    text = clean_text(text, 5000)
    if not text:
        return

    draw_rect = fitz.Rect(rect)
    draw_rect.x0 += max(float(left_padding), 0.0)
    draw_rect.x1 -= max(float(right_padding), 0.0)
    draw_rect.y0 += max(float(top_padding), 0.0)
    if draw_rect.width <= 1 or draw_rect.height <= 1:
        return

    fontsize = min(max(float(preferred_size), float(min_size)), float(max_size))
    wrapped_lines = _wrap_text_lines(text, draw_rect.width, fontsize)
    if not wrapped_lines:
        return

    step = max(fontsize * float(line_height), fontsize + 0.8)
    max_lines = max(int(draw_rect.height // step), 1)
    visible_lines = wrapped_lines[:max_lines]
    if len(wrapped_lines) > max_lines and visible_lines:
        visible_lines[-1] = _truncate_text_to_width(visible_lines[-1], draw_rect.width, fontsize)

    baseline = draw_rect.y0 + fontsize
    for idx, line in enumerate(visible_lines):
        if line == "":
            continue
        page.insert_text(
            fitz.Point(draw_rect.x0, baseline + (idx * step)),
            line,
            fontname="helv",
            fontsize=fontsize,
            color=(0, 0, 0),
        )


def _draw_creditor_table_rows(page, table_draws):
    if not table_draws:
        return

    rows = {}
    for entry in table_draws:
        row_index = int(entry.get("row") or 0)
        kind = entry.get("kind")
        rect = entry.get("rect")
        value = entry.get("value")
        if row_index <= 0 or kind not in TABLE_COLUMN_ORDER or rect is None:
            continue
        row_bucket = rows.setdefault(row_index, {})
        row_bucket[kind] = {"rect": fitz.Rect(rect), "value": value}

    if not rows:
        return

    col_x0 = {}
    col_width = {}
    for kind in TABLE_COLUMN_ORDER:
        x_values = [row[kind]["rect"].x0 for row in rows.values() if kind in row]
        w_values = [row[kind]["rect"].width for row in rows.values() if kind in row]
        if x_values:
            col_x0[kind] = _median(x_values)
        if w_values:
            col_width[kind] = _median(w_values)

    if not all(kind in col_x0 for kind in TABLE_COLUMN_ORDER):
        # Fallback defensivo: dibujar como antes si no tenemos columnas completas.
        for row in rows.values():
            for kind in TABLE_COLUMN_ORDER:
                item = row.get(kind)
                if not item:
                    continue
                draw_text_in_rect(page, item["rect"], item["value"])
        return

    row_height_values = [
        row[kind]["rect"].height
        for row in rows.values()
        for kind in TABLE_COLUMN_ORDER
        if kind in row
    ]
    row_height = max(_median(row_height_values, 12.5), 10.0)

    name_right = col_x0["CACCOUNTNUMBER"] - 4.0
    account_right = col_x0["CBALANCE"] - 4.0
    balance_right = col_x0["CDATELASTPAYMENT"] - 4.0
    date_default_width = max(120.0, col_width.get("CDATELASTPAYMENT", 114.0) * 1.35)
    date_right = min(page.rect.x1 - 18.0, col_x0["CDATELASTPAYMENT"] + date_default_width)
    if date_right <= col_x0["CDATELASTPAYMENT"] + 10.0:
        date_right = col_x0["CDATELASTPAYMENT"] + 120.0

    col_right = {
        "CNAME": name_right,
        "CACCOUNTNUMBER": account_right,
        "CBALANCE": balance_right,
        "CDATELASTPAYMENT": date_right,
    }

    styles = {
        "CNAME": {"size": 8.0, "min_size": 7.2, "max_size": 8.0, "left": 1.8, "right": 2.0, "lock": True},
        "CACCOUNTNUMBER": {"size": 8.4, "min_size": 7.4, "max_size": 8.4, "left": 1.8, "right": 2.0, "lock": True},
        "CBALANCE": {"size": 8.6, "min_size": 7.0, "max_size": 8.6, "left": 1.8, "right": 2.0, "lock": False},
        "CDATELASTPAYMENT": {"size": 8.2, "min_size": 6.8, "max_size": 8.2, "left": 1.8, "right": 2.0, "lock": False},
    }

    for row_index in sorted(rows.keys()):
        row_data = rows[row_index]
        y_values = [row_data[k]["rect"].y0 for k in TABLE_COLUMN_ORDER if k in row_data]
        if not y_values:
            continue
        y0 = _median(y_values)
        y1 = y0 + row_height

        for kind in TABLE_COLUMN_ORDER:
            value = clean_text(row_data.get(kind, {}).get("value"), 260)
            if not value:
                continue
            x0 = col_x0[kind]
            x1 = col_right[kind]
            if x1 <= x0 + 8:
                continue
            target_rect = fitz.Rect(x0, y0, x1, y1)
            style = styles[kind]
            draw_text_in_rect(
                page,
                target_rect,
                value,
                preferred_size=style["size"],
                min_size=style["min_size"],
                max_size=style["max_size"],
                left_padding=style["left"],
                right_padding=style["right"],
                lock_size=style["lock"],
            )


def _queue_override(overrides, rect, value, style=None):
    if rect is None:
        return
    style = style or {}
    overrides.append({
        "rect": fitz.Rect(rect),
        "value": clean_text(value, 260),
        "preferred_size": style.get("size"),
        "min_size": style.get("min_size", 6.8),
        "max_size": style.get("max_size", 10.5),
        "left_padding": style.get("left", 0.0),
        "right_padding": style.get("right", 0.0),
        "lock_size": style.get("lock", False),
        "multiline": bool(style.get("multiline", False)),
        "top_padding": style.get("top", 0.0),
        "line_height": style.get("line_height", 1.2),
    })


def _apply_text_overrides(page, overrides):
    if not overrides:
        return
    for item in overrides:
        page.add_redact_annot(item["rect"], fill=False)
    page.apply_redactions(
        images=REDACT_IMAGE_MODE,
        graphics=REDACT_GRAPHICS_MODE,
        text=REDACT_TEXT_MODE,
    )
    for item in overrides:
        if not item["value"]:
            continue
        if item.get("multiline"):
            draw_multiline_text_in_rect(
                page,
                item["rect"],
                item["value"],
                preferred_size=item["preferred_size"] if item["preferred_size"] is not None else item["max_size"],
                min_size=item["min_size"],
                max_size=item["max_size"],
                left_padding=item["left_padding"],
                right_padding=item["right_padding"],
                top_padding=item.get("top_padding", 0.0),
                line_height=item.get("line_height", 1.2),
            )
        else:
            draw_text_in_rect(
                page,
                item["rect"],
                item["value"],
                preferred_size=item["preferred_size"],
                min_size=item["min_size"],
                max_size=item["max_size"],
                left_padding=item["left_padding"],
                right_padding=item["right_padding"],
                lock_size=item["lock_size"],
            )


def _find_token_rect(token_hits, token, predicate=None):
    candidates = token_hits.get(token) or []
    for rect in candidates:
        if predicate is None or predicate(rect):
            return fitz.Rect(rect)
    return None


def _apply_page_overrides(page, token_hits, context):
    if not isinstance(context, dict):
        return

    include_coapp = bool(context.get("include_coapp"))
    overrides = []

    if page.number == 1:
        left_name_rect = _find_token_rect(token_hits, "/CLIENTFULLNAME/", lambda rect: rect.x0 < 300)
        left_dob_rect = _find_token_rect(token_hits, "/CLIENTDOB/", lambda rect: rect.x0 < 300)
        left_ssn_rect = _find_token_rect(token_hits, "/CLIENTSSN/", lambda rect: rect.x0 < 300)
        left_address_rect = _find_token_rect(token_hits, "/CLIENTADDRESS/", lambda rect: rect.x0 < 300)
        left_city_state_zip_rect = _find_token_rect(token_hits, "/CLIENTPHONE/", lambda rect: rect.x0 < 300)
        _queue_override(
            overrides,
            left_name_rect,
            context.get("client_name", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            left_dob_rect,
            context.get("client_dob", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            left_ssn_rect,
            context.get("client_ssn", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            left_address_rect,
            context.get("client_street", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            left_city_state_zip_rect,
            context.get("client_city_state_zip", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )

        right_name_rect = _find_token_rect(token_hits, "/CLIENTFULLNAME/", lambda rect: rect.x0 > 400)
        right_dob_rect = _find_token_rect(token_hits, "/CLIENTDOB/", lambda rect: rect.x0 > 400)
        right_ssn_rect = _find_token_rect(token_hits, "/CLIENTSSN/", lambda rect: rect.x0 > 400)
        right_address_rect = _find_token_rect(token_hits, "/CLIENTADDRESS/", lambda rect: rect.x0 > 400)
        right_city_state_zip_rect = _find_token_rect(token_hits, "/CLIENTPHONE/", lambda rect: rect.x0 > 400)

        _queue_override(
            overrides,
            right_name_rect,
            context.get("co_client_name", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            right_dob_rect,
            context.get("co_client_dob", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            right_ssn_rect,
            context.get("co_client_ssn", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            right_address_rect,
            context.get("co_client_address", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            right_city_state_zip_rect,
            context.get("co_client_city_state_zip", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )

        left_phone_rect = fitz.Rect(164.0, 221.5, 272.0, 238.8)
        right_phone_rect = fitz.Rect(460.0, 221.5, 568.0, 238.8)
        _queue_override(
            overrides,
            left_phone_rect,
            context.get("client_phone", ""),
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            right_phone_rect,
            context.get("co_client_phone", "") if include_coapp else "",
            {"size": 9.6, "min_size": 8.0, "max_size": 9.8, "left": 1.2, "right": 1.2, "lock": True},
        )

    if page.number == 8:
        _queue_override(
            overrides,
            fitz.Rect(130.0, 228.0, 236.0, 244.5),
            context.get("client_name", ""),
            {"size": 9.4, "min_size": 8.0, "max_size": 9.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(130.0, 299.0, 188.0, 315.0),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(300.0, 392.5, 356.0, 408.5),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 10:
        applicant_name_rect = fitz.Rect(144.0, 374.5, 272.0, 391.8)
        coapp_name_rect = fitz.Rect(430.0, 374.5, 558.0, 391.8)
        applicant_income_rect = fitz.Rect(201.0, 442.8, 272.0, 459.5)
        coapp_income_rect = fitz.Rect(484.0, 442.8, 558.0, 459.5)
        _queue_override(
            overrides,
            applicant_name_rect,
            context.get("client_name", ""),
            {"size": 9.4, "min_size": 8.0, "max_size": 9.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            coapp_name_rect,
            context.get("co_client_name", "") if include_coapp else "",
            {"size": 9.4, "min_size": 8.0, "max_size": 9.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            applicant_income_rect,
            context.get("income_applicant_net", "$0.00"),
            {"size": 8.6, "min_size": 7.6, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            coapp_income_rect,
            context.get("income_coapp_net", "$0.00") if include_coapp else "$0.00",
            {"size": 8.6, "min_size": 7.6, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 14:
        _queue_override(
            overrides,
            fitz.Rect(473.0, 285.4, 579.5, 300.7),
            context.get("hardship_reason", ""),
            {"size": 10.2, "min_size": 8.2, "max_size": 10.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(31.0, 299.4, 579.5, 336.8),
            context.get("hardship_reason_es", ""),
            {"size": 9.8, "min_size": 7.8, "max_size": 10.2, "left": 1.0, "right": 1.0, "top": 0.6, "multiline": True, "line_height": 1.18},
        )
        _queue_override(
            overrides,
            fitz.Rect(31.0, 338.9, 579.5, 430.5),
            context.get("hardship_reason_en", ""),
            {"size": 9.8, "min_size": 7.8, "max_size": 10.2, "left": 1.0, "right": 1.0, "top": 0.6, "multiline": True, "line_height": 1.18},
        )

    if page.number == 16:
        _queue_override(
            overrides,
            fitz.Rect(155.9, 503.8, 255.2, 518.6),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(155.9, 574.7, 206.2, 589.6),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 21:
        _queue_override(
            overrides,
            fitz.Rect(144.0, 418.0, 250.0, 434.5),
            context.get("client_name", ""),
            {"size": 9.4, "min_size": 8.0, "max_size": 9.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(144.0, 489.0, 200.0, 505.5),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 22:
        _queue_override(
            overrides,
            fitz.Rect(144.0, 574.2, 252.0, 590.4),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.8, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(144.0, 600.0, 206.0, 615.2),
            context.get("client_ssn", ""),
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(144.0, 656.5, 200.0, 672.0),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(394.0, 579.0, 491.5, 590.5),
            context.get("co_client_name", "") if include_coapp else "",
            {"size": 9.0, "min_size": 7.8, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(394.0, 606.2, 460.5, 617.8),
            context.get("co_client_ssn", "") if include_coapp else "",
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(394.0, 656.5, 451.0, 672.0),
            context.get("date_short", "") if include_coapp else "",
            {"size": 8.8, "min_size": 7.6, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 25:
        last_name_rect = fitz.Rect(48.0, 66.6, 194.0, 82.0)
        first_name_rect = fitz.Rect(201.0, 66.6, 337.0, 82.0)
        ssn_rect = fitz.Rect(371.0, 66.6, 446.0, 82.0)
        dob_rect = fitz.Rect(456.0, 66.6, 541.0, 82.0)
        co_last_rect = fitz.Rect(48.0, 92.0, 194.0, 107.0)
        co_first_rect = fitz.Rect(201.0, 92.0, 337.0, 107.0)
        co_ssn_rect = fitz.Rect(371.0, 92.0, 446.0, 107.0)
        co_dob_rect = fitz.Rect(456.0, 92.0, 541.0, 107.0)
        address_rect = fitz.Rect(48.0, 165.8, 340.0, 181.8)
        city_rect = fitz.Rect(348.0, 165.8, 450.0, 181.8)
        state_rect = fitz.Rect(456.0, 165.8, 531.0, 181.8)
        zip_rect = fitz.Rect(541.0, 165.8, 595.0, 181.8)
        phone_rect = fitz.Rect(48.0, 191.2, 338.0, 207.2)
        email_rect = fitz.Rect(348.0, 191.2, 528.0, 207.2)
        _queue_override(
            overrides,
            last_name_rect,
            context.get("client_last_name", ""),
            {"size": 9.2, "min_size": 7.4, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            first_name_rect,
            context.get("client_first_name", ""),
            {"size": 9.2, "min_size": 7.4, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            ssn_rect,
            context.get("client_ssn", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            dob_rect,
            context.get("client_dob", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            co_last_rect,
            context.get("co_client_name", "") if include_coapp else "",
            {"size": 8.8, "min_size": 7.2, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            co_first_rect,
            "",
            {"size": 8.8, "min_size": 7.2, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            co_ssn_rect,
            context.get("co_client_ssn", "") if include_coapp else "",
            {"size": 8.8, "min_size": 7.2, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            co_dob_rect,
            context.get("co_client_dob", "") if include_coapp else "",
            {"size": 8.8, "min_size": 7.2, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            address_rect,
            context.get("client_street", ""),
            {"size": 9.4, "min_size": 7.8, "max_size": 9.6, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            city_rect,
            context.get("client_city", ""),
            {"size": 9.2, "min_size": 7.4, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            state_rect,
            context.get("client_state", ""),
            {"size": 9.2, "min_size": 7.4, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            zip_rect,
            context.get("client_zip", ""),
            {"size": 9.2, "min_size": 7.4, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            phone_rect,
            context.get("client_phone", ""),
            {"size": 8.8, "min_size": 7.0, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            email_rect,
            context.get("client_email", ""),
            {"size": 8.8, "min_size": 7.0, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 26:
        is_checking = bool(context.get("bank_is_checking"))
        is_savings = bool(context.get("bank_is_savings"))
        if not is_checking and not is_savings:
            is_checking = True
        is_personal = bool(context.get("bank_is_personal"))
        is_commercial = bool(context.get("bank_is_commercial"))
        if not is_personal and not is_commercial:
            is_personal = True
        _queue_override(
            overrides,
            fitz.Rect(60.0, 245.0, 392.0, 257.6),
            context.get("bank_name", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(60.0, 271.0, 201.5, 283.6),
            context.get("bank_routing_number", ""),
            {"size": 8.8, "min_size": 7.0, "max_size": 8.8, "left": 1.2, "right": 1.2, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(214.0, 271.0, 292.0, 283.6),
            context.get("bank_account_number", ""),
            {"size": 8.8, "min_size": 6.8, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(307.9, 271.2, 314.4, 279.1),
            "x" if is_checking else "",
            {"size": 7.4, "min_size": 6.6, "max_size": 7.4, "left": 0.0, "right": 0.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(353.4, 271.2, 360.0, 279.1),
            "x" if is_savings else "",
            {"size": 7.4, "min_size": 6.6, "max_size": 7.4, "left": 0.0, "right": 0.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(307.9, 281.8, 314.4, 289.7),
            "x" if is_personal else "",
            {"size": 7.4, "min_size": 6.6, "max_size": 7.4, "left": 0.0, "right": 0.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(354.3, 281.8, 360.9, 289.7),
            "x" if is_commercial else "",
            {"size": 7.4, "min_size": 6.6, "max_size": 7.4, "left": 0.0, "right": 0.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(68.0, 345.0, 215.0, 360.0),
            context.get("bank_holder_name", ""),
            {"size": 9.2, "min_size": 7.6, "max_size": 9.4, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(56.0, 373.0, 287.0, 388.5),
            context.get("bank_holder_street", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(294.0, 373.0, 406.5, 388.5),
            context.get("bank_holder_city", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(408.0, 373.0, 462.0, 388.5),
            context.get("bank_holder_state", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(462.0, 373.0, 532.0, 388.5),
            context.get("bank_holder_zip", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(62.0, 475.0, 128.0, 491.5),
            context.get("bank_draft_amount_usd", ""),
            {"size": 8.8, "min_size": 7.0, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": False},
        )
        _queue_override(
            overrides,
            fitz.Rect(212.0, 475.0, 282.0, 491.5),
            context.get("bank_draft_amount_bare", ""),
            {"size": 8.8, "min_size": 7.0, "max_size": 8.8, "left": 1.0, "right": 1.0, "lock": False},
        )
        _queue_override(
            overrides,
            fitz.Rect(133.0, 475.0, 186.0, 490.5),
            context.get("first_deposit_date", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(396.0, 717.2, 442.0, 730.5),
            context.get("date_short", ""),
            {"size": 8.6, "min_size": 7.2, "max_size": 8.8, "left": 0.8, "right": 0.8, "lock": True},
        )

    if page.number == 32:
        _queue_override(
            overrides,
            fitz.Rect(201.2, 78.5, 300.8, 93.5),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(303.2, 67.2, 353.6, 82.0),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 34:
        _queue_override(
            overrides,
            fitz.Rect(170.0, 197.6, 269.6, 212.6),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(484.6, 197.6, 535.0, 212.6),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(385.4, 285.4, 435.8, 300.4),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(385.4, 322.2, 435.8, 337.2),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    if page.number == 35:
        _queue_override(overrides, fitz.Rect(101.0, 72.5, 215.0, 88.0), context.get("client_name", ""), {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(73.0, 509.0, 216.0, 524.5), context.get("client_name", ""), {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(450.0, 509.0, 508.0, 524.5), context.get("date_short", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(73.0, 571.0, 138.0, 586.8), context.get("client_ssn_last4", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(450.0, 571.0, 509.0, 586.8), context.get("client_dob", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})

    if page.number == 36:
        _queue_override(overrides, fitz.Rect(93.0, 55.5, 208.0, 71.0), context.get("client_name", ""), {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(73.0, 480.8, 216.0, 496.0), context.get("client_name", ""), {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(450.0, 480.8, 509.0, 496.0), context.get("date_short", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(73.0, 543.2, 138.0, 558.8), context.get("client_ssn_last4", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})
        _queue_override(overrides, fitz.Rect(450.0, 543.2, 509.0, 558.8), context.get("client_dob", ""), {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True})

    if page.number == 37:
        _queue_override(
            overrides,
            fitz.Rect(59.0, 109.4, 196.0, 124.8),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(59.0, 149.2, 348.0, 164.6),
            context.get("client_street", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(348.0, 149.2, 427.5, 164.6),
            context.get("client_city", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(428.0, 149.2, 498.5, 164.6),
            context.get("client_state", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(498.5, 149.2, 560.0, 164.6),
            context.get("client_zip", ""),
            {"size": 9.0, "min_size": 7.4, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(73.0, 639.4, 216.0, 654.8),
            context.get("client_name", ""),
            {"size": 9.0, "min_size": 7.6, "max_size": 9.2, "left": 1.0, "right": 1.0, "lock": True},
        )
        _queue_override(
            overrides,
            fitz.Rect(456.0, 639.4, 509.0, 654.8),
            context.get("date_short", ""),
            {"size": 8.8, "min_size": 7.4, "max_size": 9.0, "left": 1.0, "right": 1.0, "lock": True},
        )

    _apply_text_overrides(page, overrides)


def _rects_overlap(r1, r2, threshold=0.3):
    inter = r1 & r2
    if inter.is_empty:
        return False
    r1_area = max(r1.width * r1.height, 0.001)
    return (inter.width * inter.height) / r1_area > threshold


def _process_page(page, placeholders, legacy, context):
    # Hint de texto para evitar buscar tokens que no existen en la pagina.
    page_text = page.get_text("text") or ""

    # Fase 1: buscar y redactar placeholders (merge fields del template).
    ph_draws = []
    table_draws = []
    ph_rects = []
    token_hits = {}
    for text, value in placeholders.items():
        if text and text not in page_text:
            continue
        for rect in page.search_for(text):
            page.add_redact_annot(rect, fill=False)
            token_hits.setdefault(text, []).append(fitz.Rect(rect))
            token_match = TABLE_TOKEN_PATTERN.match(text)
            if token_match:
                table_draws.append({
                    "kind": token_match.group(1),
                    "row": int(token_match.group(2)),
                    "rect": fitz.Rect(rect),
                    "value": value,
                })
            else:
                ph_draws.append((rect, value))
            ph_rects.append(rect)

    # Fase 2: buscar y redactar datos legacy contaminados.
    # Si un rect legacy se solapa con un placeholder, solo se borra (no se dibuja).
    legacy_draws = []
    legacy_used = []
    for text, value in legacy.items():
        if text and text not in page_text:
            continue
        for rect in page.search_for(text):
            if any(_rects_overlap(rect, used, 0.3) for used in legacy_used):
                continue
            page.add_redact_annot(rect, fill=False)
            legacy_used.append(rect)
            overlaps_ph = any(_rects_overlap(rect, pr, 0.3) for pr in ph_rects)
            if not overlaps_ph and value:
                legacy_draws.append((rect, value))

    all_draws = ph_draws + legacy_draws
    if all_draws or ph_rects or legacy_used:
        page.apply_redactions(
            images=REDACT_IMAGE_MODE,
            graphics=REDACT_GRAPHICS_MODE,
            text=REDACT_TEXT_MODE,
        )
        for rect, value in all_draws:
            draw_text_in_rect(page, rect, value)
        _draw_creditor_table_rows(page, table_draws)

    _apply_page_overrides(page, token_hits, context)

    # Fase 3: regex cleanup de sign_applicant/sign_coapp residuales.
    if "sign_" not in page_text:
        return
    sign_rects = []
    for block in page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE).get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if SIGN_PLACEHOLDER_PATTERN.search(span.get("text", "")):
                    sign_rects.append(fitz.Rect(span["bbox"]))
    if sign_rects:
        for rect in sign_rects:
            page.add_redact_annot(rect, fill=False)
        page.apply_redactions(
            images=REDACT_IMAGE_MODE,
            graphics=REDACT_GRAPHICS_MODE,
            text=REDACT_TEXT_MODE,
        )


def generate_contract(template_path, output_path, payload):
    placeholders, legacy, render_context = build_replacements(payload)
    doc = fitz.open(template_path)
    try:
        for page in doc:
            _process_page(page, placeholders, legacy, render_context)
        doc.save(output_path, garbage=4, deflate=True)
    finally:
        doc.close()


def parse_args():
    parser = argparse.ArgumentParser(description="Genera contrato PDF a partir de plantilla y payload JSON.")
    parser.add_argument("--template", required=True, help="Ruta al PDF plantilla.")
    parser.add_argument("--payload", required=True, help="Ruta al JSON con datos.")
    parser.add_argument("--output", required=True, help="Ruta de salida del PDF generado.")
    return parser.parse_args()


def main():
    args = parse_args()
    template_path = Path(args.template).resolve()
    payload_path = Path(args.payload).resolve()
    output_path = Path(args.output).resolve()

    if not template_path.exists():
        raise FileNotFoundError(f"No existe plantilla: {template_path}")
    if not payload_path.exists():
        raise FileNotFoundError(f"No existe payload: {payload_path}")

    payload = json.loads(payload_path.read_text(encoding="utf-8-sig"))
    output_path.parent.mkdir(parents=True, exist_ok=True)

    generate_contract(str(template_path), str(output_path), payload)
    print(str(output_path))


if __name__ == "__main__":
    main()
