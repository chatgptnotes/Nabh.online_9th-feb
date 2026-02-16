import type { StructuredExtraction } from '../services/documentExtractor';

/**
 * Parse extracted_text into structured data.
 * Handles both JSON format (new) and legacy plain text (backward compat).
 */
export function parseExtractedText(text: string): StructuredExtraction {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && (parsed.keyValuePairs || parsed.sections || parsed.tables)) {
      return {
        title: parsed.title || undefined,
        documentType: parsed.documentType || undefined,
        keyValuePairs: Array.isArray(parsed.keyValuePairs) ? parsed.keyValuePairs : [],
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        tables: Array.isArray(parsed.tables) ? parsed.tables : [],
      };
    }
  } catch {
    // Not JSON, fall through to plain text parsing
  }

  return parseMarkdownText(text);
}

function cleanBoldMarkers(str: string): string {
  return str.replace(/\*\*/g, '').replace(/^\*\s+/, '').trim();
}

function parseMarkdownText(text: string): StructuredExtraction {
  const result: StructuredExtraction = {
    keyValuePairs: [],
    sections: [],
    tables: [],
    rawText: '',
  };

  const lines = text.split('\n');
  let currentSection: { heading: string; content: string } | null = null;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  const remainingLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect section headers:
    // "**1. Document Title and Headers:**"
    // "## Section Name"
    // "**Section Name**"
    const sectionMatch = line.match(/^\*\*(\d+\.\s*.+?):?\*\*:?\s*$/) ||
      line.match(/^#{1,3}\s+(.+)$/) ||
      line.match(/^\*\*([^*]+)\*\*\s*$/);
    if (sectionMatch) {
      if (currentSection) {
        result.sections.push(currentSection);
      }
      currentSection = { heading: cleanBoldMarkers(sectionMatch[1]).replace(/:$/, '').trim(), content: '' };
      continue;
    }

    // Detect key:value pairs (multiple formats):
    // "* **Document Title:** PROPOSAL FOR..."
    // "**Date:** 04 FEB 2025"
    // "Document Title: PROPOSAL FOR..."
    const kvBoldBullet = line.match(/^\*\s+\*\*([^*:]+)\*\*\s*:\s*(.+)$/);
    const kvBold = line.match(/^\*\*([^*:]+)\*\*\s*:\s*(.+)$/);
    const kvPlain = line.match(/^([A-Z][A-Za-z\s\/\.\-#()\d]+?)\s*:\s*(.+)$/);
    const kvMatch = kvBoldBullet || kvBold || kvPlain;

    if (kvMatch && kvMatch[2].trim().length > 0 && !line.includes('|')) {
      result.keyValuePairs.push({
        key: cleanBoldMarkers(kvMatch[1]).trim(),
        value: cleanBoldMarkers(kvMatch[2]).trim(),
      });
      continue;
    }

    // Detect markdown tables (lines with |)
    if (line.includes('|') && line.startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
      const nextLine = lines[i + 1]?.trim() || '';

      if (nextLine.match(/^\|[\s\-:|]+\|/)) {
        tableHeaders = cells;
        inTable = true;
        i++; // skip separator row
        continue;
      } else if (inTable) {
        tableRows.push(cells);
        continue;
      }
    } else if (inTable) {
      if (tableHeaders.length > 0) {
        result.tables.push({ headers: tableHeaders, rows: tableRows });
      }
      tableHeaders = [];
      tableRows = [];
      inTable = false;
    }

    // Accumulate into current section or remaining
    if (currentSection) {
      // Clean bullet markers and bold from content lines
      const cleanLine = cleanBoldMarkers(line);
      if (cleanLine) {
        currentSection.content += (currentSection.content ? '\n' : '') + cleanLine;
      }
    } else {
      // Skip intro lines like "Here's the extracted..."
      const isIntroLine = /^(here'?s|the following|extracted|below)/i.test(line);
      if (!isIntroLine) {
        remainingLines.push(cleanBoldMarkers(line));
      }
    }
  }

  // Flush remaining state
  if (inTable && tableHeaders.length > 0) {
    result.tables.push({ headers: tableHeaders, rows: tableRows });
  }
  if (currentSection) {
    result.sections.push(currentSection);
  }
  if (remainingLines.length > 0) {
    result.rawText = remainingLines.join('\n');
  }

  return result;
}
