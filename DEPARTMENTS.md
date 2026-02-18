# DEPARTMENTS - Feature Documentation

## Overview
Hospital departments management system with document upload, AI-powered text extraction (Gemini Vision), structured data display, and PDF/Excel export. Part of the NABH Evidence Creator.

---

## Tech Stack
- React 18 + TypeScript
- MUI Components
- Supabase (DB + Storage)
- Gemini 2.0 Flash (AI extraction)
- jsPDF + XLSX (export)

---

## Routes
| Route | Component | Purpose |
|-------|-----------|---------|
| `/departments` | DepartmentsMasterPage | Master list - CRUD |
| `/department/:code` | DepartmentDetailPage | Detail page - documents |

---

## Components

### 1. DepartmentsMasterPage
**File:** `src/components/DepartmentsMasterPage.tsx`

Departments ka master list page. Table view with Add/Edit/Delete.

**Features:**
- Fetches departments from Supabase `departments` table
- Auto-seeds 17 required departments if missing (Casualty, Cath Lab, CSSD, ICU, OT, etc.)
- Add/Edit dialog with fields: name, description, head_of_department, contact_number, services
- Soft delete (is_active = false)
- Snackbar notifications

### 2. DepartmentDetailPage
**File:** `src/components/DepartmentDetailPage.tsx`

Individual department detail page. Document/entry management.

**Features:**
- Manual title + description entry (Save button)
- File upload under selected title (Upload button)
- Parent-child document hierarchy
- AI text extraction on upload (Gemini Vision)
- StructuredDataView for extracted data
- Delete entries (cascades to child documents)

**Data Flow:**
```
User creates Title → Selects Title from dropdown → Uploads PDF/Image
→ File goes to Supabase Storage (documents/departments/{code}/)
→ DB record in department_documents
→ Gemini Vision API extracts text
→ JSON saved to extracted_text column
→ StructuredDataView renders tables/fields
→ User can Download PDF or Excel
```

**Entry Types:**
- **Title (Manual):** file_url = 'manual-entry', has description in extracted_text
- **Document (Uploaded):** file_url = Supabase public URL, parent encoded in filename as `[parent:{parentId}]filename`
- **Orphan:** Uploaded files without parent title

### 3. StructuredDataView
**File:** `src/components/StructuredDataView.tsx`

Displays AI-extracted structured data.

**Shows:**
- Document title + type badge (Register, Form, Certificate, etc.)
- Document Fields table (key-value pairs)
- Sections (heading + content)
- Extracted tables with headers and rows
- Certificate of Register Verification
- Download PDF / Download Excel buttons

---

## Services

### departmentDocumentStorage.ts
**File:** `src/services/departmentDocumentStorage.ts`

**Functions:**
| Function | Purpose |
|----------|---------|
| `getDocuments(deptCode)` | Fetch all documents for department |
| `uploadFile(deptCode, file)` | Upload to Supabase storage + create DB record |
| `updateExtractedText(id, text)` | Save AI-extracted JSON |
| `deleteDocument(doc)` | Delete from storage + DB |

**Storage Path:** `documents/departments/{deptCode}/{timestamp}_{random}.{ext}`

### documentExtractor.ts
**File:** `src/services/documentExtractor.ts`

**AI Extraction using Gemini 2.0 Flash:**
| Function | Purpose |
|----------|---------|
| `extractFromDocument(file, category)` | Main extraction - images, PDFs |
| `extractTextFromImage(file)` | Image OCR via Gemini Vision |
| `extractTextFromPDF(file)` | Multi-page PDF extraction |
| `reExtractEmptyTables(file, data)` | Re-extract tables with >40% empty cells |
| `repairTruncatedJSON(str)` | Fix truncated JSON from token limits |
| `analyzeDocument(text, category)` | Analyze document structure |
| `generateSOPFromContent(...)` | Generate SOP from extracted content |

**Extraction Output Format (JSON):**
```json
{
  "title": "Stock Register",
  "documentType": "register",
  "keyValuePairs": [{"key": "Name", "value": "Casualty Equipment Register"}],
  "sections": [{"heading": "Purpose", "content": "..."}],
  "tables": [{
    "caption": "Equipment List",
    "data": "Item|Qty|Date\nAtropine|5|02/18"
  }]
}
```

**Safety Rules:**
- NEVER fabricate hospital data
- Use ONLY real staff/patient/doctor names from database
- Use "-" for blank cells, "[illegible]" for unreadable text
- Extract ALL pages of multi-page documents

---

## Database

### departments table
**Migration:** `supabase/migrations/010_create_departments_table.sql`

```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY,
    dept_id VARCHAR(20) UNIQUE,
    name VARCHAR(100),
    code VARCHAR(20) UNIQUE,
    category VARCHAR(50),        -- Clinical Speciality, Super Speciality, Support, Admin
    type VARCHAR(50),            -- Medical, Surgical, Diagnostic, Support, Administrative
    description TEXT,
    head_of_department VARCHAR(100),
    contact_number VARCHAR(20),
    nabh_is_active BOOLEAN,
    nabh_last_audit_date DATE,
    nabh_compliance_status VARCHAR(20),
    services TEXT[],
    equipment_list TEXT[],
    staff_count INTEGER,
    is_emergency_service BOOLEAN,
    operating_hours VARCHAR(50),
    hospital_id VARCHAR(50) DEFAULT 'hope-hospital',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Indexes:** hospital_id, category, code, type

### department_documents table
**Migration:** `supabase/migrations/create_department_documents.sql`

```sql
CREATE TABLE department_documents (
    id UUID PRIMARY KEY,
    department_code VARCHAR(20) NOT NULL,
    file_name TEXT,
    file_url TEXT,
    file_type VARCHAR(50),
    file_size BIGINT,
    extracted_text TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Index:** department_code

---

## Storage
- **Bucket:** `documents` (PUBLIC)
- **Path:** `departments/{deptCode}/{timestamp}_{random}.{ext}`
- **Accepted:** PDF, PNG, JPG, JPEG
- **Size Limit:** 50MB

---

## Sidebar Departments List
**File:** `src/components/Sidebar.tsx`

Sidebar dynamically fetches departments from DB and shows under "DEPARTMENTS" section. Clicking navigates to `/department/{code}`.

**Auto-seeded Departments (17):**
Casualty, Cath Lab, CSSD, General Ward - F/M, HR, ICU, Infection Control, Laboratory, Maintenance Reg., Management, MRD, OT, Pathology, Pharmacy, Physiotherapy, Radiology, Reception, Ultrasound, USG, X-ray

---

## Master Data - 30 Departments
**File:** `src/data/departmentsMaster.ts`

| Category | Departments |
|----------|------------|
| **Clinical Speciality (11)** | Anaesthesia, CCU, Family Medicine, General Medicine, General Surgery, Joint Replacement, Orthopaedics, ENT, Respiratory Medicine, Day Care, Vascular Surgery |
| **Super Speciality (8)** | Gastroenterology, ICU, Neurology, Neurosurgery, Surgical Oncology, Plastic Surgery, Urology, Surgical Gastroenterology |
| **Support Services (10)** | Biomedical Engineering, CSSD, Physiotherapy, Clinical Biochemistry, Clinical Pathology, Haematology, Radiology, Housekeeping, IT |
| **Administration (2)** | General Administration, Human Resources |

---

## Export Features

### PDF Export
- jsPDF library
- Formatted tables with blue headers (#1565C0)
- Key-value pairs, sections, extracted tables
- Alternating row colors
- Multi-page support

### Excel Export
- XLSX library
- Separate sections for tables
- Column width: 25 chars
- Filename: `{documentName}_extracted.xlsx`

---

## Prompt for AI Extraction (Gemini)

The AI extraction prompt includes:
1. Document type detection (form, register, certificate, report, etc.)
2. Key-value pair extraction (Name, Date, Department, Page No., etc.)
3. Table extraction in compact pipe-delimited format
4. Section extraction with headings
5. Real hospital data context (30 patients, staff, doctors from database)
6. OCR error correction for handwritten text
7. Common hospital items list for stock registers
8. Certificate of Register Verification generation

---

## Version
- Feature: Departments & Document Management
- Status: PRODUCTION
- Hospital: Hope Hospital, Nagpur
