#!/usr/bin/env python3
"""Analiza reportes de crédito PDF para entender su estructura"""

import pdfplumber
import json
import re

def extract_pdf_text(pdf_path):
    """Extrae texto de un PDF"""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text += page.extract_text() + "\n\n---PAGE BREAK---\n\n"
    return text

def analyze_credit_report(pdf_path, output_name):
    """Analiza un reporte de crédito y guarda el resultado"""
    print(f"\n{'='*60}")
    print(f"Analizando: {pdf_path}")
    print(f"{'='*60}")
    
    text = extract_pdf_text(pdf_path)
    
    # Guardar texto completo para análisis
    with open(f"{output_name}_raw.txt", "w", encoding="utf-8") as f:
        f.write(text)
    
    # Buscar patrones relevantes
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    # Buscar creditors (líneas que parecen nombres de acreedores)
    creditor_patterns = []
    account_patterns = []
    status_patterns = []
    type_patterns = []
    months_patterns = []
    responsibility_patterns = []
    
    for i, line in enumerate(lines):
        # Buscar "Month's Reviewed" o "Months Reviewed"
        if re.search(r"Month'?s?\s+Reviewed", line, re.IGNORECASE):
            months_patterns.append((i, line))
        
        # Buscar "Responsibility"
        if re.search(r"Responsibility", line, re.IGNORECASE):
            responsibility_patterns.append((i, line))
        
        # Buscar "Account Number"
        if re.search(r"Account\s+Number", line, re.IGNORECASE):
            account_patterns.append((i, line))
        
        # Buscar "Account Status"
        if re.search(r"Account\s+Status", line, re.IGNORECASE):
            status_patterns.append((i, line))
        
        # Buscar "Type" (cuando aparece solo)
        if re.match(r"^Type\s+\w+", line):
            type_patterns.append((i, line))
    
    print(f"\n--- Patrones encontrados ---")
    print(f"Account Numbers ({len(account_patterns)}):")
    for idx, line in account_patterns[:10]:
        print(f"  L{idx}: {line}")
    
    print(f"\nAccount Status ({len(status_patterns)}):")
    for idx, line in status_patterns[:10]:
        print(f"  L{idx}: {line}")
    
    print(f"\nType ({len(type_patterns)}):")
    for idx, line in type_patterns[:10]:
        print(f"  L{idx}: {line}")
    
    print(f"\nResponsibility ({len(responsibility_patterns)}):")
    for idx, line in responsibility_patterns[:10]:
        print(f"  L{idx}: {line}")
    
    print(f"\nMonths Reviewed ({len(months_patterns)}):")
    for idx, line in months_patterns[:10]:
        print(f"  L{idx}: {line}")
    
    # Extraer secciones de creditors (primeras 200 líneas para muestra)
    print(f"\n--- Primeras 200 líneas ---")
    for i, line in enumerate(lines[:200]):
        print(f"{i:3d}: {line}")
    
    return text

# Analizar ambos PDFs
print("ANÁLISIS DE REPORTES DE CRÉDITO")
print("=" * 60)

try:
    text1 = analyze_credit_report("reference/Credit Report example (1).pdf", "report1")
except Exception as e:
    print(f"Error con reporte 1: {e}")

try:
    text2 = analyze_credit_report("reference/Credit Report example (2).pdf", "report2")
except Exception as e:
    print(f"Error con reporte 2: {e}")

print("\n✅ Análisis completo. Revisa los archivos .txt generados.")
