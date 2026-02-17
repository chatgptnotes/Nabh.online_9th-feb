/**
 * Document Extraction Service
 * Handles text extraction from various document formats (images, PDFs, Word docs)
 * Uses Gemini Vision API for intelligent text extraction
 */

import { callGeminiAPI, callGeminiVisionAPI, getGeminiApiKey } from '../lib/supabase';
import { fetchRealPatients, fetchRealStaff, fetchVisitingConsultants } from './hopeHospitalDatabase';

export interface ExtractionResult {
  success: boolean;
  text: string;
  documentType?: string;
  structuredData?: Record<string, unknown>;
  error?: string;
}

export interface DocumentAnalysis {
  documentType: string;
  title?: string;
  sections: { heading: string; content: string }[];
  tables?: { headers: string[]; rows: string[][] }[];
  keyValuePairs?: Record<string, string>;
  signatures?: string[];
  dates?: string[];
  suggestions?: string[];
}

export interface StructuredExtraction {
  title?: string;
  documentType?: string;
  keyValuePairs: { key: string; value: string }[];
  sections: { heading: string; content: string }[];
  tables: { caption?: string; headers: string[]; rows: string[][] }[];
  rawText?: string;
}

/**
 * Repair truncated JSON by closing unclosed brackets/arrays
 */
export const repairTruncatedJSON = (str: string): object | null => {
  let fixed = str.trim();
  // Remove trailing incomplete string values (cut off mid-string)
  fixed = fixed.replace(/,\s*"[^"]*$/, '');  // remove trailing incomplete key-value
  fixed = fixed.replace(/,\s*\[[^\]]*$/, ''); // remove trailing incomplete array element
  fixed = fixed.replace(/,\s*$/, '');          // remove trailing comma

  // Count open brackets and close them
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let escaped = false;

  for (const ch of fixed) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  // If we're inside a string, close it
  if (inString) fixed += '"';

  // Close unclosed brackets (arrays first, then objects)
  for (let i = 0; i < Math.max(0, openBrackets); i++) fixed += ']';
  for (let i = 0; i < Math.max(0, openBraces); i++) fixed += '}';

  try {
    return JSON.parse(fixed);
  } catch {
    // Second attempt: more aggressive cleanup
    try {
      // Remove last incomplete row/element and retry
      fixed = fixed.replace(/,\s*\{[^}]*$/, '');
      fixed = fixed.replace(/,\s*\[[^\]]*$/, '');
      fixed = fixed.replace(/,\s*$/, '');
      // Recount and close
      openBraces = 0; openBrackets = 0; inString = false; escaped = false;
      for (const ch of fixed) {
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') openBraces++;
        if (ch === '}') openBraces--;
        if (ch === '[') openBrackets++;
        if (ch === ']') openBrackets--;
      }
      if (inString) fixed += '"';
      for (let i = 0; i < Math.max(0, openBrackets); i++) fixed += ']';
      for (let i = 0; i < Math.max(0, openBraces); i++) fixed += '}';
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
};

/**
 * Check if extracted tables have too many empty cells and re-extract if needed.
 * Returns improved JSON string with better table data.
 */
const reExtractEmptyTables = async (
  file: File,
  parsedData: any,
  geminiApiKey: string,
): Promise<any> => {
  if (!parsedData || !Array.isArray(parsedData.tables) || parsedData.tables.length === 0) {
    return parsedData;
  }

  // Check each table for empty cells
  const tablesToReExtract: number[] = [];
  for (let ti = 0; ti < parsedData.tables.length; ti++) {
    const table = parsedData.tables[ti];
    const dataStr = table.data;
    if (!dataStr || typeof dataStr !== 'string') continue;

    const lines = dataStr.split('\n').filter((l: string) => l.trim());
    if (lines.length <= 1) continue; // header only

    const headerCols = lines[0].split('|').length;
    let totalCells = 0;
    let emptyCells = 0;

    for (let r = 1; r < lines.length; r++) {
      const cells = lines[r].split('|');
      for (let c = 0; c < Math.max(cells.length, headerCols); c++) {
        totalCells++;
        const val = (cells[c] || '').trim();
        if (!val || val === '') emptyCells++;
      }
    }

    const emptyRatio = totalCells > 0 ? emptyCells / totalCells : 0;
    console.log(`[reExtractEmptyTables] Table ${ti}: ${emptyCells}/${totalCells} cells empty (${(emptyRatio * 100).toFixed(1)}%)`);

    if (emptyRatio > 0.4) {
      tablesToReExtract.push(ti);
    }
  }

  if (tablesToReExtract.length === 0) {
    console.log('[reExtractEmptyTables] All tables have good data, no re-extraction needed');
    return parsedData;
  }

  console.log(`[reExtractEmptyTables] ${tablesToReExtract.length} table(s) need re-extraction`);

  // Build re-extraction prompt with the partial data as context
  const tableDescriptions = tablesToReExtract.map(ti => {
    const t = parsedData.tables[ti];
    return `Table ${ti + 1} (caption: "${t.caption || 'N/A'}"):\nPartial data extracted:\n${t.data}`;
  }).join('\n\n');

  const reExtractPrompt = `I previously extracted tables from this document but many cells came back EMPTY. Please re-read the document carefully and extract the COMPLETE table data.

Here is what was partially extracted (many cells are blank that should have values):
${tableDescriptions}

TASK: Re-read the document and provide the COMPLETE table data with ALL cells filled in.

Return a JSON object with this structure:
{
  "tables": [
    {
      "caption": "Table title",
      "data": "Col1|Col2|Col3\\nVal1|Val2|Val3"
    }
  ]
}

RULES:
- Read EVERY cell in EVERY row carefully, especially handwritten text
- NEVER leave cells empty. Use "-" for genuinely blank cells, "[illegible]" for unreadable text
- The ITEM/NAME column in stock registers ALWAYS has a medication or supply name — read it carefully
- Common hospital items: Atropine, Adrenaline, Deriphylline, Aminophylline, Dopamine, Dobutamine, Amiodarone, Lignocaine, Sodium Bicarbonate, Calcium Gluconate, Dexamethasone, Hydrocortisone, Furosemide, Mannitol, Midazolam, Diazepam, etc.
- Every row must have the same number of pipe separators as the header
- Return ONLY the JSON object, no markdown code fences`;

  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type === 'application/pdf' ? 'application/pdf' : file.type;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: reExtractPrompt },
              { inline_data: { mime_type: mimeType, data: base64.split(',')[1] } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 32768 },
        }),
      }
    );

    const respData = await response.json();
    const rawText = respData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[reExtractEmptyTables] Re-extraction response length:', rawText.length);

    // Parse the response
    let reExtracted: any = null;
    try {
      let cleanText = rawText.trim();
      const fenceMatch = cleanText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/) ||
                         cleanText.match(/^```(?:json)?\s*\n?([\s\S]*)/);
      if (fenceMatch) cleanText = fenceMatch[1].trim();
      reExtracted = JSON.parse(cleanText);
    } catch {
      // Try repair
      const jsonMatch = rawText.match(/(\{[\s\S]*)/);
      if (jsonMatch) {
        reExtracted = repairTruncatedJSON(jsonMatch[1]);
      }
    }

    if (reExtracted && Array.isArray(reExtracted.tables)) {
      // Merge re-extracted tables back into original data
      for (let i = 0; i < tablesToReExtract.length && i < reExtracted.tables.length; i++) {
        const ti = tablesToReExtract[i];
        const newTable = reExtracted.tables[i];
        if (newTable && newTable.data && typeof newTable.data === 'string') {
          // Count empty cells in new extraction
          const newLines = newTable.data.split('\n').filter((l: string) => l.trim());
          let newEmpty = 0;
          let newTotal = 0;
          for (let r = 1; r < newLines.length; r++) {
            const cells = newLines[r].split('|');
            for (const c of cells) { newTotal++; if (!c.trim()) newEmpty++; }
          }
          const newEmptyRatio = newTotal > 0 ? newEmpty / newTotal : 1;

          // Only use re-extraction if it's actually better
          const oldLines = parsedData.tables[ti].data.split('\n').filter((l: string) => l.trim());
          let oldEmpty = 0;
          let oldTotal = 0;
          for (let r = 1; r < oldLines.length; r++) {
            const cells = oldLines[r].split('|');
            for (const c of cells) { oldTotal++; if (!c.trim()) oldEmpty++; }
          }
          const oldEmptyRatio = oldTotal > 0 ? oldEmpty / oldTotal : 1;

          if (newEmptyRatio < oldEmptyRatio) {
            console.log(`[reExtractEmptyTables] Table ${ti}: improved from ${(oldEmptyRatio * 100).toFixed(1)}% empty to ${(newEmptyRatio * 100).toFixed(1)}% empty`);
            parsedData.tables[ti] = newTable;
          } else {
            console.log(`[reExtractEmptyTables] Table ${ti}: re-extraction not better, keeping original`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[reExtractEmptyTables] Error during re-extraction:', error);
    // Return original data if re-extraction fails
  }

  return parsedData;
};

/**
 * Convert file to base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};

/**
 * Extract text from image using Gemini Vision
 */
export const extractTextFromImage = async (
  file: File,
  prompt?: string
): Promise<ExtractionResult> => {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return { success: false, text: '', error: 'Gemini API key not configured' };
  }

  try {
    const base64 = await fileToBase64(file);
    const defaultPrompt = `Extract ALL text content from this document image and return it as a JSON object.

Return a valid JSON object with this exact structure:
{
  "title": "Document title or heading",
  "documentType": "form|register|certificate|report|letter|sop|other",
  "keyValuePairs": [
    {"key": "Field Label", "value": "Field Value"}
  ],
  "sections": [
    {"heading": "Section Name", "content": "Section body text..."}
  ],
  "tables": [
    {
      "caption": "Table title if any",
      "data": "Col1|Col2|Col3\\nVal1|Val2|Val3\\nVal4|Val5|Val6"
    }
  ]
}

IMPORTANT TABLE FORMAT: The "data" field must be a SINGLE STRING with pipe-delimited (|) columns and newline-separated (\\n) rows. First line = headers, remaining lines = data rows.

CRITICAL TABLE EXTRACTION RULES (STRICTLY ENFORCED):
- EVERY cell in EVERY row MUST have a value. NEVER leave a cell empty between pipes.
  - If a cell is genuinely blank/empty in the document: output "-"
  - If a cell has text you cannot read clearly: output "[illegible]"
  - If a cell has handwritten text: read it carefully and output your best reading
- COUNT YOUR COLUMNS: Every data row must have EXACTLY the same number of pipe (|) separators as the header row.
- For stock registers, inventory logs, and equipment lists:
  - The ITEM/NAME column ALWAYS contains a value — it is NEVER blank
  - Read handwritten entries character by character if needed
  - DATE columns contain dates — read the numbers carefully
- For ALL table types: read EVERY cell value from the document. Do not skip or leave blank.

General Rules:
- CRITICAL: Extract ALL visible text. NEVER return empty keyValuePairs AND empty sections AND empty tables if there is ANY readable text. At minimum, put all readable text into a section.
- For training documents/certificates: extract Topic, Date, Trainer, Participants, Duration, Venue, Department into keyValuePairs. Attendance lists go in tables.
- For any document with visible text: extract every piece of readable text into appropriate fields.
- Put labeled fields into keyValuePairs, narrative text into sections, tabular data into tables
- Table headers MUST be descriptive column names from the document
- Fix OCR/spelling errors. Correct capitalization of names. Standardize prefixes (Mr., Mrs., Miss., Dr.).
- Watch for OCR confusions: "W" vs "U", "l" vs "I", "0" vs "O", "rn" vs "m".
- Read HANDWRITTEN text carefully. Mark illegible text as "[illegible]".
- Extract ALL content including handwritten entries, checkboxes, scores, comments.
- If no table, return empty tables array
- Return ONLY the JSON object, no markdown code fences
- Ensure valid JSON`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt || defaultPrompt },
              { inline_data: { mime_type: file.type, data: base64.split(',')[1] } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      }
    );

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to extract clean JSON from response
    let structuredText = rawText;
    try {
      const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) || rawText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        JSON.parse(jsonStr); // validate
        structuredText = jsonStr;
      }
    } catch {
      // Keep rawText as-is
    }

    // Quality check: re-extract tables with too many empty cells
    try {
      let parsed: any = null;
      try {
        parsed = JSON.parse(structuredText);
      } catch {
        // If not valid JSON, skip re-extraction
      }
      if (parsed && Array.isArray(parsed.tables) && parsed.tables.length > 0) {
        const improved = await reExtractEmptyTables(file, parsed, geminiApiKey);
        structuredText = JSON.stringify(improved);
      }
    } catch (reExtractError) {
      console.warn('[extractTextFromImage] Re-extraction check failed, using original:', reExtractError);
    }

    return { success: true, text: structuredText, documentType: 'image' };
  } catch (error) {
    console.error('Error extracting text from image:', error);
    return { success: false, text: '', error: 'Failed to extract text from image' };
  }
};

/**
 * Extract text from PDF using Gemini Vision (for scanned PDFs)
 * For text-based PDFs, we'll use a simple approach
 */
export const extractTextFromPDF = async (
  file: File,
  prompt?: string
): Promise<ExtractionResult> => {
  console.log('[extractTextFromPDF] Starting PDF extraction, file size:', file.size);

  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    console.error('[extractTextFromPDF] Gemini API key not configured');
    return { success: false, text: '', error: 'Gemini API key not configured' };
  }
  console.log('[extractTextFromPDF] Gemini API key found');

  try {
    // For PDFs, we'll convert first page to image and extract
    // In a production app, you'd use a proper PDF parsing library
    console.log('[extractTextFromPDF] Converting file to base64...');
    const base64 = await fileToBase64(file);
    console.log('[extractTextFromPDF] Base64 length:', base64.length);

    const defaultPrompt = `Extract ALL text content from this PDF document and return it as a JSON object.

CRITICAL: This PDF may have MULTIPLE PAGES. You MUST extract content from ALL pages, not just the first page. Read every single page thoroughly.

Return a valid JSON object with this exact structure:
{
  "title": "Document title or heading",
  "documentType": "form|register|certificate|report|letter|sop|other",
  "keyValuePairs": [
    {"key": "Field Label", "value": "Field Value"}
  ],
  "sections": [
    {"heading": "Section Name", "content": "Section body text..."}
  ],
  "tables": [
    {
      "caption": "Table title if any",
      "data": "Col1|Col2|Col3\\nVal1|Val2|Val3\\nVal4|Val5|Val6"
    }
  ]
}

IMPORTANT TABLE FORMAT: The "data" field must be a SINGLE STRING with pipe-delimited (|) columns and newline-separated (\\n) rows. First line = column headers, remaining lines = data rows. This compact format is REQUIRED to fit all data. Example for a stock register:
"data": "Sl.No|Item|Standard Count|Expiry Date|Replaced Date|Remark\\n1|Atropine 1ml|5|03/25|01/25|Ok\\n2|Adrenaline 1ml|5|06/25|02/25|Ok\\n3|Deriphylline 2ml|10|12/25|08/25|-\\n4|Aminophylline|5|04/25|-|-"

CRITICAL TABLE EXTRACTION RULES (STRICTLY ENFORCED):
- EVERY cell in EVERY row MUST have a value. NEVER leave a cell empty between pipes.
  - If a cell is genuinely blank/empty in the document: output "-"
  - If a cell has text you cannot read clearly: output "[illegible]"
  - If a cell has handwritten text: read it carefully and output your best reading
- COUNT YOUR COLUMNS: Every data row must have EXACTLY the same number of pipe (|) separators as the header row. If a row has fewer pipes, you missed a column — go back and fix it.
- For stock registers, inventory logs, and equipment lists:
  - The ITEM/NAME column ALWAYS contains a medication name, supply name, or equipment name — it is NEVER blank. Read it carefully.
  - Read handwritten entries character by character if needed. Use context clues from surrounding items.
  - Common hospital items: Atropine, Adrenaline, Deriphylline, Aminophylline, Dopamine, Dobutamine, Amiodarone, Lignocaine, Sodium Bicarbonate, Calcium Gluconate, Dexamethasone, Hydrocortisone, Furosemide, Mannitol, Midazolam, Diazepam, Phenytoin, Magnesium Sulphate, Neostigmine, Glycopyrrolate, Succinylcholine, Atracurium, Vecuronium, Propofol, Ketamine, Thiopentone, Fentanyl, Morphine, Tramadol, Ondansetron, Metoclopramide, Ranitidine, Pantoprazole, Heparin, Protamine, etc.
  - DATE columns contain dates in DD/MM/YY or MM/YY format — read the numbers carefully
  - COUNT columns contain numeric values
- For ALL table types: read EVERY cell value from the document. Do not skip or leave blank.

General Rules:
- CRITICAL: Extract data from ALL PAGES. Do NOT stop at the first page.
- For registers/inventory/log documents: extract EVERY SINGLE ROW from ALL pages into the "data" string. Do NOT skip any rows.
- If a table spans multiple pages, combine ALL rows into ONE table "data" string.
- Put labeled fields (like "Document No:", "Date:", "Department:") into keyValuePairs
- Put narrative text into sections with headings
- Table headers MUST be descriptive column names from the document. Never use generic names.
- Fix OCR/spelling errors. Correct capitalization of names (proper case). Standardize prefixes (Mr., Mrs., Miss., Dr.).
- Watch for OCR confusions: "W" vs "U", "l" vs "I", "0" vs "O", "rn" vs "m". Use context to resolve.
- Read HANDWRITTEN text carefully. Mark illegible text as "[illegible]".
- Extract ALL content including handwritten entries, checkboxes, scores, and comments.
- If there is no table, return empty tables array
- Return ONLY the JSON object, no markdown code fences
- Ensure valid JSON`;

    console.log('[extractTextFromPDF] Calling Gemini API...');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt || defaultPrompt },
              { inline_data: { mime_type: 'application/pdf', data: base64.split(',')[1] } }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 32768 },
        }),
      }
    );

    console.log('[extractTextFromPDF] Gemini API response status:', response.status);
    const data = await response.json();
    console.log('[extractTextFromPDF] Gemini API response:', JSON.stringify(data).substring(0, 500));

    if (data.error) {
      console.error('[extractTextFromPDF] Gemini API error:', data.error);
      return { success: false, text: '', error: data.error.message || 'Gemini API error' };
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason || '';
    console.log('[extractTextFromPDF] Raw text length:', rawText.length, 'finishReason:', finishReason);

    if (finishReason === 'MAX_TOKENS') {
      console.warn('[extractTextFromPDF] Output was TRUNCATED due to token limit. Attempting JSON repair...');
    }

    // Try to extract clean JSON from response
    let structuredText = rawText;
    try {
      // Use greedy regex to capture full JSON
      const jsonMatch = rawText.match(/```json\n?([\s\S]*)\n?```/) || rawText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        JSON.parse(jsonStr); // validate
        structuredText = jsonStr;
      }
    } catch {
      // JSON.parse failed — likely truncated. Try to repair.
      console.log('[extractTextFromPDF] JSON parse failed, attempting repair...');
      const jsonMatch = rawText.match(/```json\n?([\s\S]*)/) || rawText.match(/(\{[\s\S]*)/);
      if (jsonMatch) {
        const truncatedJson = jsonMatch[1] || jsonMatch[0];
        const repaired = repairTruncatedJSON(truncatedJson);
        if (repaired) {
          console.log('[extractTextFromPDF] JSON repair successful');
          structuredText = JSON.stringify(repaired);
        }
      }
    }

    // Quality check: re-extract tables with too many empty cells
    try {
      let parsed: any = null;
      try {
        parsed = JSON.parse(structuredText);
      } catch {
        // If not valid JSON, skip re-extraction
      }
      if (parsed && Array.isArray(parsed.tables) && parsed.tables.length > 0) {
        const improved = await reExtractEmptyTables(file, parsed, geminiApiKey);
        structuredText = JSON.stringify(improved);
      }
    } catch (reExtractError) {
      console.warn('[extractTextFromPDF] Re-extraction check failed, using original:', reExtractError);
    }

    return { success: true, text: structuredText, documentType: 'pdf' };
  } catch (error) {
    console.error('[extractTextFromPDF] Error:', error);
    return { success: false, text: '', error: 'Failed to extract text from PDF' };
  }
};

/**
 * Analyze document structure and extract structured data
 */
export const analyzeDocument = async (
  text: string,
  documentCategory: string
): Promise<DocumentAnalysis> => {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return { documentType: 'unknown', sections: [] };
  }

  const prompts: Record<string, string> = {
    stationery: `Analyze this hospital stationery/form text and extract:
1. Document type (form, register, certificate, letterhead, etc.)
2. Title of the document
3. All sections with their headings and content
4. Table structures if any
5. Form fields and their labels
6. Suggestions for improvement (formatting, missing fields, NABH compliance)

Text to analyze:
${text}

Return as JSON with keys: documentType, title, sections[], tables[], keyValuePairs{}, suggestions[]`,

    committee: `Analyze this committee document/SOP and extract:
1. Committee name
2. Committee objectives/purpose
3. Members list with roles
4. Meeting frequency
5. Key responsibilities
6. Recent meeting details if mentioned
7. Suggestions for improvement

Text to analyze:
${text}

Return as JSON with keys: committeeName, objectives[], members[], meetingFrequency, responsibilities[], meetings[], suggestions[]`,

    kpi: `Analyze this KPI/quality indicator document and extract:
1. KPI names and definitions
2. Target values
3. Current values if mentioned
4. Calculation formulas
5. Data sources
6. Trends or historical data
7. Suggestions for additional KPIs

Text to analyze:
${text}

Return as JSON with keys: kpis[{name, target, current, formula, category}], suggestions[]`,

    presentation: `Analyze this presentation/slide content and extract:
1. Presentation title
2. Slide titles and content
3. Key points and data
4. Charts/graphs descriptions
5. Suggestions for improvement

Text to analyze:
${text}

Return as JSON with keys: title, slides[{title, content, keyPoints[]}], suggestions[]`,
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompts[documentCategory] || prompts.stationery }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      }
    );

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to parse JSON from response
    try {
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
                       responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return {
          documentType: parsed.documentType || documentCategory,
          title: parsed.title || parsed.committeeName,
          sections: parsed.sections || [],
          keyValuePairs: parsed.keyValuePairs,
          suggestions: parsed.suggestions || [],
        };
      }
    } catch {
      // If JSON parsing fails, return basic structure
    }

    return {
      documentType: documentCategory,
      sections: [{ heading: 'Extracted Content', content: responseText }],
    };
  } catch (error) {
    console.error('Error analyzing document:', error);
    return { documentType: 'unknown', sections: [] };
  }
};

/**
 * Generate improved document from extracted content
 */
export const generateImprovedDocument = async (
  extractedText: string,
  documentCategory: string,
  userSuggestions: string,
  hospitalName: string = 'Hope Hospital'
): Promise<string> => {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return '';
  }

  const prompts: Record<string, string> = {
    stationery: `Create an improved, professionally formatted hospital document based on this extracted content.

Original Document Content:
${extractedText}

User's Improvement Suggestions:
${userSuggestions || 'Make it NABH compliant and professional'}

Requirements:
1. Hospital: ${hospitalName}
2. Create a complete HTML document with embedded CSS
3. Include professional header with hospital name and logo placeholder
4. Use proper typography and spacing
5. Add all necessary fields for NABH compliance
6. Include proper footer with document control information
7. Make it print-ready (A4 size)
8. Use professional color scheme (blue: #1565C0)

Generate complete, ready-to-use HTML document.`,

    committee: `Create a professional Committee SOP/Charter document based on this extracted content.

Original Document Content:
${extractedText}

User's Improvement Suggestions:
${userSuggestions || 'Make it NABH compliant'}

Requirements:
1. Hospital: ${hospitalName}
2. Create a complete HTML document
3. Include: Purpose, Scope, Composition, Responsibilities, Meeting Frequency, Reporting
4. Add proper header and footer
5. Include signature blocks for Chairperson and Members
6. NABH compliant format
7. Document control number and version

Generate complete HTML document for the committee SOP.`,

    kpi: `Create a professional KPI Dashboard/Report based on this extracted content.

Original Document Content:
${extractedText}

User's Improvement Suggestions:
${userSuggestions || 'Create a comprehensive KPI tracking document'}

Requirements:
1. Hospital: ${hospitalName}
2. Create HTML document with tables for KPI tracking
3. Include: KPI Name, Formula, Target, Actual, Variance, Trend
4. Add sections for different KPI categories
5. Include space for monthly data entry
6. Professional formatting
7. Print-ready format

Generate complete HTML KPI tracking document.`,

    presentation: `Create professional presentation slides based on this extracted content.

Original Document Content:
${extractedText}

User's Improvement Suggestions:
${userSuggestions || 'Make it suitable for NABH auditor presentation'}

Requirements:
1. Hospital: ${hospitalName}
2. Create HTML slides with proper styling
3. Include title slide with hospital branding
4. Clear, concise bullet points
5. Professional color scheme
6. Each slide should fit one screen
7. Add speaker notes sections

Generate complete HTML presentation with multiple slides.`,
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompts[documentCategory] || prompts.stationery }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
      }
    );

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract HTML from response
    const htmlMatch = content.match(/```html\n?([\s\S]*?)\n?```/);
    if (htmlMatch) {
      content = htmlMatch[1];
    }

    return content;
  } catch (error) {
    console.error('Error generating improved document:', error);
    return '';
  }
};

/**
 * Extract committee data from uploaded SOP
 */
export const extractCommitteeData = async (text: string): Promise<{
  name: string;
  description: string;
  objectives: string[];
  members: { name: string; role: string; designation: string }[];
  meetingFrequency: string;
  responsibilities: string[];
}> => {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return { name: '', description: '', objectives: [], members: [], meetingFrequency: '', responsibilities: [] };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Extract committee information from this document:

${text}

Return JSON with:
{
  "name": "Committee Name",
  "description": "Brief description",
  "objectives": ["objective1", "objective2"],
  "members": [{"name": "Name", "role": "Chairperson/Member", "designation": "Job Title"}],
  "meetingFrequency": "Monthly/Quarterly/etc",
  "responsibilities": ["responsibility1", "responsibility2"]
}

Only return the JSON, no other text.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      }
    );

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Return empty if parsing fails
    }

    return { name: '', description: '', objectives: [], members: [], meetingFrequency: '', responsibilities: [] };
  } catch (error) {
    console.error('Error extracting committee data:', error);
    return { name: '', description: '', objectives: [], members: [], meetingFrequency: '', responsibilities: [] };
  }
};

/**
 * Extract KPI data from uploaded document
 */
export const extractKPIData = async (text: string): Promise<{
  kpis: { name: string; category: string; target: number; unit: string; formula: string }[];
}> => {
  const geminiApiKey = getGeminiApiKey();
  if (!geminiApiKey) {
    return { kpis: [] };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Extract KPI/Quality Indicator information from this document:

${text}

Return JSON with:
{
  "kpis": [
    {
      "name": "KPI Name",
      "category": "clinical/patient_safety/infection/nursing/laboratory/operational/patient_experience",
      "target": 5,
      "unit": "%",
      "formula": "Calculation formula"
    }
  ]
}

Only return the JSON, no other text.` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      }
    );

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Return empty if parsing fails
    }

    return { kpis: [] };
  } catch (error) {
    console.error('Error extracting KPI data:', error);
    return { kpis: [] };
  }
};

/**
 * Extract text from PDF using URL (fetches the PDF first)
 */
export const extractTextFromPDFUrl = async (
  pdfUrl: string,
  prompt?: string
): Promise<ExtractionResult> => {
  console.log('[extractTextFromPDFUrl] Starting extraction for:', pdfUrl);

  try {
    // Fetch PDF from URL
    console.log('[extractTextFromPDFUrl] Fetching PDF...');
    const response = await fetch(pdfUrl);
    console.log('[extractTextFromPDFUrl] Fetch response status:', response.status);

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    console.log('[extractTextFromPDFUrl] Blob size:', blob.size, 'type:', blob.type);

    const file = new File([blob], 'document.pdf', { type: 'application/pdf' });
    console.log('[extractTextFromPDFUrl] File created, calling extractTextFromPDF...');

    // Use existing extraction function
    const result = await extractTextFromPDF(file, prompt);
    console.log('[extractTextFromPDFUrl] Extraction result:', result.success ? 'SUCCESS' : 'FAILED', result.error || '');

    return result;
  } catch (error) {
    console.error('[extractTextFromPDFUrl] Error:', error);
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Failed to extract text from PDF URL',
    };
  }
};

/**
 * Generate SOP from extracted PDF content and user interpretation
 * Uses EXACT same format as evidence generation with Hope Hospital branding
 */
export const generateSOPFromContent = async (
  pdfContent: string,
  titlesInterpretation: string,
  chapterCode: string,
  chapterName: string,
  customPrompt?: string,
  objectiveCode?: string
): Promise<{ success: boolean; sop: string; error?: string }> => {
  console.log('[generateSOPFromContent] Starting SOP generation for chapter:', chapterCode);

  // Using secure backend proxy - no API key needed in frontend

  const today = new Date();
  const effectiveDate = new Date(2025, 8, 9); // Fixed: 09 Sept 2025
  const reviewDate = new Date(2025, 8, 9); // Same date: 09 Sept 2025
  const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const objectiveTitle = titlesInterpretation.split('\n')[0] || '';

  const docNo = `SOP-${chapterCode}-${objectiveCode ? objectiveCode.replace(/\./g, '-') : '001'}`;

  // Use actual Hope Hospital logo and signature images - relative paths work in iframe
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const logoUrl = `${baseUrl}/assets/hope-hospital-logo.png`;
  const sonaliSignature = `${baseUrl}/Sonali's signature.png`;
  const gauravSignature = `${baseUrl}/Gaurav's signature.png`;
  const shirazSignature = `${baseUrl}/Dr shiraz's signature.png`;

  if (!customPrompt || !customPrompt.trim()) {
    return { success: false, sop: '', error: 'No SOP generation prompt provided. Please select a prompt from the database.' };
  }

  // Fetch real patient, staff, and doctor data from database - fetch more for variety
  const [realPatients, realStaff, realDoctorsRaw] = await Promise.all([
    fetchRealPatients(30),
    fetchRealStaff(),
    fetchVisitingConsultants(),
  ]);

  // Shuffle doctors array so different doctors appear at top each time (prevents AI from always picking first 3-4)
  const realDoctors = [...realDoctorsRaw].sort(() => Math.random() - 0.5);

  // Also shuffle staff for variety
  const shuffledStaff = [...realStaff].sort(() => Math.random() - 0.5);

  const patientList = realPatients.length > 0
    ? realPatients.map(p => `- ${p.patient_name} (Visit ID: ${p.visit_id}, Diagnosis: ${p.diagnosis || 'N/A'}, Admission: ${p.admission_date || 'N/A'}, Status: ${p.status || 'N/A'})`).join('\n')
    : 'No patient data available';

  const staffList = shuffledStaff.length > 0
    ? shuffledStaff.map(s => `- ${s.name} (${s.designation}, ${s.department}${s.responsibilities ? ', Responsibilities: ' + s.responsibilities.join(', ') : ''})`).join('\n')
    : 'No staff data available';

  const doctorList = realDoctors.length > 0
    ? realDoctors.map((d, i) => `- ${i + 1}. Dr. ${d.name} (${d.department || 'Consultant'}${d.qualification ? ', ' + d.qualification : ''}${d.registration_no ? ', Reg: ' + d.registration_no : ''})`).join('\n')
    : 'No doctor data available';

  try {
    const prompt = `You are an expert in NABH (National Accreditation Board for Hospitals and Healthcare Providers) accreditation documentation for Hope Hospital.

## CRITICAL RULE - REAL DATA ONLY (STRICTLY ENFORCED):
You MUST use ONLY the real data provided below from the hospital database. This is NON-NEGOTIABLE:
- Every patient name, Visit ID, diagnosis, and date MUST come from the database list below
- Every staff member name, designation, and department MUST come from the database list below
- Every doctor name, qualification, and registration number MUST come from the database list below
- Do NOT invent, fabricate, or hallucinate ANY names, IDs, dates, diagnoses, or other data
- If you need data that is not available in the database below, use generic role-based references (e.g., "Duty Nurse", "On-call Doctor") instead of making up names
- Any example, case study, or reference in the SOP must use ONLY real patient/staff/doctor names from the lists below

## ABSOLUTE NAME RESTRICTION (ZERO TOLERANCE):
- The ONLY person names you may use in this entire document are from the Staff Members and Doctors lists below. NO EXCEPTIONS.
- If the SOP requires a role that doesn't exist in the staff list (e.g., "Chief Engineer", "Electrical Technician", "Bio-Medical Engineer"),
  assign the CLOSEST matching real staff member from the list OR use the role title only (e.g., "The Chief Engineer" without a personal name).
- NEVER invent names. Examples of FAKE names you must NEVER use: Rajesh Kumar, Amit Patel, Sunita Sharma, Priya Singh, Anil Gupta, Vikram Mehta, Suresh Reddy, Deepak Verma, Meena Joshi, Sanjay Mishra.
  If ANY name in your output does not appear in the database lists below, that is a CRITICAL ERROR.
- For the "Responsibility" section specifically: ONLY pick names from the Staff Members and Doctors lists provided below. Map each responsibility to the closest matching real staff member by their designation/department.

## DOCTOR SELECTION - MATCH BY DEPARTMENT/SPECIALTY (IMPORTANT):
- There are ${realDoctors.length} doctors/visiting consultants available. Pick the ones MOST RELEVANT to this SOP's topic based on their department and specialty.
- For example: if the SOP is about cardiac care, pick cardiologists. If about orthopedic procedures, pick orthopedic surgeons. If about infection control, pick relevant specialists.
- Do NOT default to the same few doctors every time. Carefully scan the FULL list below and select doctors whose department/specialty matches this SOP's subject.
- Use at least 5-8 different doctors where applicable, chosen by relevance to the SOP topic.

## REAL HOSPITAL DATABASE (${realPatients.length} patients, ${realStaff.length} staff, ${realDoctors.length} doctors):
### Patients:
${patientList}

### Staff Members:
${staffList}

### Doctors / Visiting Consultants:
${doctorList}

---

Generate a complete Standard Operating Procedure (SOP) HTML document in ENGLISH ONLY.

## CONTEXT
- Hospital Chapter: ${chapterCode} - ${chapterName}
- Objective Code: ${objectiveCode || chapterCode}
- SHCO 3rd Edition Interpretation & Objective:
${titlesInterpretation}

## Historical Data / Source Content:
${pdfContent}

## User Specific Instructions:
${customPrompt}

IMPORTANT: Generate the output as a complete, valid HTML document with embedded CSS styling. The document must be modern, professional, and print-ready.

Use EXACTLY this HTML template structure (fill in the content sections):

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SOP - ${objectiveCode || chapterCode} - Hope Hospital</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 14px; line-height: 1.6; color: #333; padding: 0 15px 15px; width: 100%; max-width: 800px; margin-left: auto !important; margin-right: auto !important; }
    .header { text-align: center; border-bottom: 3px solid #1565C0; padding-bottom: 5px; margin-bottom: 15px; margin-top: 0 !important; padding-top: 0 !important; line-height: 1; }
    .logo { width: 180px; height: auto; margin: 0 auto !important; padding: 0 !important; display: block; vertical-align: top; }
    .hospital-address { font-size: 13px; color: #666; margin: 0 !important; padding: 0 !important; line-height: 1.2; }
    .doc-title { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 12px; font-size: 20px; font-weight: bold; text-align: center; margin: 20px 0; border-radius: 5px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .info-table th, .info-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .info-table th { background: #f5f5f5; font-weight: 600; width: 25%; }
    .auth-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .auth-table th { background: linear-gradient(135deg, #1565C0, #0D47A1); color: white; padding: 10px; text-align: center; }
    .auth-table td { border: 1px solid #ddd; padding: 15px; text-align: center; vertical-align: top; }
    .signature-box { margin-top: 10px; padding: 8px; border: 1px solid #1565C0; border-radius: 5px; background: #f8f9fa; }
    .signature-name { font-weight: bold; color: #1565C0; font-size: 16px; }
    .signature-line { font-family: 'Brush Script MT', cursive; font-size: 22px; color: #0D47A1; margin: 5px 0; }
    .section { margin: 20px 0; page-break-inside: avoid; }
    .section-title { background: #e3f2fd; padding: 8px 12px; font-weight: bold; color: #1565C0; border-left: 4px solid #1565C0; margin-bottom: 10px; }
    .section-content { padding: 10px 15px; page-break-inside: avoid; }
    .section-content ul { margin-left: 20px; }
    .section-content li { margin: 5px 0; page-break-inside: avoid; }
    .procedure-step { margin: 10px 0; padding: 10px; background: #fafafa; border-radius: 5px; border-left: 3px solid #1565C0; page-break-inside: avoid; }
    .step-number { display: inline-block; width: 25px; height: 25px; background: #1565C0; color: white; border-radius: 50%; text-align: center; line-height: 25px; margin-right: 10px; font-weight: bold; }
    .data-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    .data-table th { background: #1565C0; color: white; padding: 10px; text-align: left; }
    .data-table td { border: 1px solid #ddd; padding: 8px; }
    .data-table tr:nth-child(even) { background: #f9f9f9; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #1565C0; text-align: center; font-size: 12px; color: #666; }
    .revision-table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
    .revision-table th { background: #455a64; color: white; padding: 8px; }
    .revision-table td { border: 1px solid #ddd; padding: 8px; }
    .stamp-area { border: 2px dashed #1565C0; border-radius: 10px; padding: 15px; text-align: center; margin: 20px 0; background: #f8f9fa; }
    .stamp-text { font-weight: bold; color: #1565C0; font-size: 16px; }
    @media print { body { padding: 0; max-width: 100%; margin: 0 auto; } .no-print { display: none; } @page { margin: 20mm; size: A4; } .section, .section-content, .procedure-step, .info-table, .auth-table, .data-table, tr { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div style="font-size: 28px; font-weight: bold; color: #1565C0; margin-bottom: 10px;">SOP</div>
  <div class="header">
    <img src="${logoUrl}" alt="Dr. Murali's Hope Hospital" class="logo" style="width: 180px; height: auto; display: block; margin: 0 auto !important; padding: 0 !important; vertical-align: top;">
    <div class="hospital-address">2, Teka Naka, Nagpur, Maharashtra 440022 | Phone: +91 9823555053 | Email: info@hopehospital.com</div>
  </div>

  <div class="doc-title">SOP-${objectiveCode || chapterCode} - ${objectiveTitle}</div>

  <table class="info-table">
    <tr><th>Document No</th><td>${docNo}</td><th>Version</th><td>1.0</td></tr>
    <tr><th>Department</th><td>Quality Department</td><th>Category</th><td>SOP</td></tr>
    <tr><th>Effective Date</th><td>${formatDate(effectiveDate)}</td><th>Review Date</th><td>${formatDate(reviewDate)}</td></tr>
    <tr><th>Objective Code</th><td colspan="3">${objectiveCode || chapterCode} - [Objective Title from content]</td></tr>
  </table>

  <table class="auth-table">
    <tr><th>PREPARED BY</th><th>REVIEWED BY</th><th>APPROVED BY</th></tr>
    <tr>
      <td>
        <div>Name: Sonali Kakde</div>
        <div>Designation: Clinical Audit Coordinator</div>
        <div>Date: ${formatDate(effectiveDate)}</div>
        <div style="margin-top: 10px;">Signature:</div>
        <img src="${sonaliSignature}" alt="Sonali Signature" style="height: 50px; max-width: 120px; object-fit: contain;">
      </td>
      <td>
        <div>Name: Gaurav Agrawal</div>
        <div>Designation: Hospital Administrator</div>
        <div>Date: ${formatDate(effectiveDate)}</div>
        <div style="margin-top: 10px;">Signature:</div>
        <img src="${gauravSignature}" alt="Gaurav Signature" style="height: 50px; max-width: 120px; object-fit: contain;">
      </td>
      <td>
        <div>Name: Dr. Shiraz Khan</div>
        <div>Designation: Quality Coordinator / Administrator</div>
        <div>Date: ${formatDate(effectiveDate)}</div>
        <div style="margin-top: 10px;">Signature:</div>
        <img src="${shirazSignature}" alt="Dr. Shiraz Signature" style="height: 50px; max-width: 120px; object-fit: contain;">
      </td>
    </tr>
  </table>

  [GENERATE THESE SECTIONS WITH DETAILED CONTENT:]

  <div class="section">
    <div class="section-title">1. Purpose</div>
    <div class="section-content">[Generate detailed purpose based on the objective and interpretation]</div>
  </div>

  <div class="section">
    <div class="section-title">2. Scope</div>
    <div class="section-content">[Generate scope and applicability]</div>
  </div>

  <div class="section">
    <div class="section-title">3. Responsibility</div>
    <div class="section-content">[List responsible personnel - ONLY use names from the REAL staff database below. DO NOT invent any names.
Real Staff Members:
${staffList}
Real Doctors:
${doctorList}
Map each SOP responsibility to the closest matching real staff member above. If no staff member matches a role, use the role title only WITHOUT a personal name (e.g., "The Maintenance In-charge" not "Rajesh Kumar, Maintenance In-charge").]</div>
  </div>

  <div class="section">
    <div class="section-title">4. Definitions</div>
    <div class="section-content">[Define key terms used in this SOP]</div>
  </div>

  <div class="section">
    <div class="section-title">5. Procedure</div>
    <div class="section-content">
      [Generate detailed step-by-step procedure using procedure-step divs:
      <div class="procedure-step"><span class="step-number">1</span> Step description...</div>
      ]
    </div>
  </div>

  <div class="section">
    <div class="section-title">6. Documentation</div>
    <div class="section-content">[List required documents, forms, and records]</div>
  </div>

  <div class="section">
    <div class="section-title">7. References</div>
    <div class="section-content">[Reference NABH standards, guidelines, and related documents]</div>
  </div>

  <table class="revision-table">
    <tr><th>Version</th><th>Date</th><th>Description</th><th>Author</th></tr>
    <tr><td>1.0</td><td>${formatDate(effectiveDate)}</td><td>Initial Release</td><td>Sonali Kakde</td></tr>
  </table>

  <div class="stamp-area">
    <div class="stamp-text">[HOSPITAL STAMP AREA]</div>
  </div>

  <div class="footer">
    <strong>Hope Hospital</strong> | 2, Teka Naka, Nagpur | Phone: +91 9823555053 | Email: info@hopehospital.com<br>
    This is a controlled document. Unauthorized copying is prohibited.
  </div>
</body>
</html>

REMINDER: Every single name (patient, staff, doctor) in this SOP MUST come from the REAL HOSPITAL DATABASE provided above. Zero fabricated data allowed. Use actual Visit IDs, real diagnoses, and real dates from the database.

Generate the complete HTML document with all sections filled with relevant, professional content based on the provided interpretation and source content. Return ONLY the HTML, no markdown or explanations.`;

    console.log('[generateSOPFromContent] Calling secure backend proxy...');
    const data = await callGeminiAPI(prompt, 0.7, 8192);

    let sop = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean markdown code blocks if AI included them
    sop = sop.replace(/```html/gi, '').replace(/```/g, '').trim();

    // Ensure it starts with proper DOCTYPE
    if (!sop.toLowerCase().startsWith('<!doctype')) {
      sop = '<!DOCTYPE html>\n<html lang="en">\n' + sop;
    }

    // Validate: check if AI returned template placeholders instead of actual content
    const placeholderCount = (sop.match(/\[(State the|Define the|Generate\s|Specify\s|Describe\s|List\s+responsible|Any prerequisites|Who performs|Role responsible)/gi) || []).length;
    if (placeholderCount >= 3) {
      console.warn(`[generateSOPFromContent] WARNING: Generated SOP contains ${placeholderCount} template placeholders. AI may not have filled in actual content.`);
    }

    console.log('[generateSOPFromContent] Generated SOP length:', sop.length);

    // Validate: check for fake/hallucinated names not in the real staff or doctor database
    const allRealNames = [
      ...realStaff.map(s => s.name.toLowerCase()),
      ...realDoctors.map(d => d.name.toLowerCase()),
      'sonali kakde', 'gaurav agrawal', 'dr. shiraz khan', 'shiraz khan',
    ];
    const commonFakeNames = [
      'rajesh kumar', 'amit patel', 'sunita sharma', 'priya singh', 'anil gupta',
      'vikram mehta', 'suresh reddy', 'deepak verma', 'meena joshi', 'sanjay mishra',
      'ravi sharma', 'neha gupta', 'pooja patel', 'rahul verma', 'anita singh',
      'manoj kumar', 'rekha sharma', 'vijay singh', 'kavita joshi', 'ashok mehta',
    ];
    const foundFakeNames = commonFakeNames.filter(fakeName => sop.toLowerCase().includes(fakeName));
    if (foundFakeNames.length > 0) {
      console.warn(`[generateSOPFromContent] WARNING: SOP contains likely FAKE names: ${foundFakeNames.join(', ')}. These are NOT in the real staff database.`);
    }

    return { success: true, sop };
  } catch (error) {
    console.error('[generateSOPFromContent] Error:', error);
    return {
      success: false,
      sop: '',
      error: error instanceof Error ? error.message : 'Failed to generate SOP',
    };
  }
};

/**
 * Filter relevant content from old SOP text based on objective
 * Used in the new 3rd Edition NABH workflow
 */
export const filterRelevantContent = async (
  oldSOPText: string,
  objectiveCode: string,
  objectiveTitle: string,
  interpretation: string,
  customFilterPrompt?: string
): Promise<{ success: boolean; filteredText?: string; error?: string }> => {
  console.log('[filterRelevantContent] Starting filter for objective:', objectiveCode);

  // Using secure backend proxy - no API key needed in frontend

  if (!oldSOPText || oldSOPText.trim().length === 0) {
    return { success: false, error: 'No old SOP text provided to filter' };
  }

  if (!customFilterPrompt || !customFilterPrompt.trim()) {
    return { success: false, error: 'No filter prompt provided. Please select a prompt from the database.' };
  }

  try {
    const prompt = `${customFilterPrompt}

## OBJECTIVE DETAILS
- Code: ${objectiveCode}
- Title: ${objectiveTitle}
- Interpretation: ${interpretation}

## OLD SOP TEXT (F1) TO FILTER:
${oldSOPText}

## OUTPUT
Start directly with bullet points. No commentary or analysis.`;

    console.log('[filterRelevantContent] Calling secure backend proxy...');
    const data = await callGeminiAPI(prompt, 0.3, 8192);

    let filteredText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean AI response - remove any commentary before bullet points
    // Find first bullet point and keep only from there
    const bulletIndex = filteredText.indexOf('•');
    const dashIndex = filteredText.indexOf('- ');
    const starIndex = filteredText.indexOf('* ');

    // Find the earliest bullet point marker
    const indices = [bulletIndex, dashIndex, starIndex].filter(i => i !== -1);
    if (indices.length > 0) {
      const firstBullet = Math.min(...indices);
      if (firstBullet > 0) {
        // Remove everything before the first bullet
        filteredText = filteredText.substring(firstBullet);
        console.log('[filterRelevantContent] Cleaned commentary, starting from bullet point');
      }
    }

    console.log('[filterRelevantContent] Filtered text length:', filteredText.length);

    return { success: true, filteredText };
  } catch (error) {
    console.error('[filterRelevantContent] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to filter content',
    };
  }
};

/**
 * Unified document extraction based on file type
 */
export const extractFromDocument = async (
  file: File,
  _category: string,
  customPrompt?: string
): Promise<ExtractionResult> => {
  const fileType = file.type;

  if (fileType.startsWith('image/')) {
    return extractTextFromImage(file, customPrompt);
  } else if (fileType === 'application/pdf') {
    return extractTextFromPDF(file, customPrompt);
  } else if (
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    // For Word documents, we'll try to extract via Gemini
    // In production, you'd use a proper library like mammoth.js
    return extractTextFromPDF(file, customPrompt);
  } else {
    return { success: false, text: '', error: 'Unsupported file type' };
  }
};
