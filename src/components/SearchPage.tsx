import { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Paper,
  Alert,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Visibility as VisibilityIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useNABHStore } from '../store/nabhStore';
import { supabase } from '../lib/supabase';

// Search result interface
interface SearchResult {
  id: string;
  type: 'objective' | 'sop' | 'evidence';
  title: string;
  code: string;
  chapter?: string;
  priority: 'high' | 'medium' | 'low';
  url: string;
  foundVia?: 'metadata' | 'content';
  contentSnippet?: string;
  relevanceScore?: number;  // 3=title, 2=code, 1=description
}

type SearchSource = 'all' | 'sop' | 'evidence';

// Normalize string for fuzzy matching: "hic 4 a" matches "HIC.4.a"
const normalize = (str: string) => str.toLowerCase().replace(/[\s._\-,]/g, '');

// Compute relevance score: 3=title match, 2=code match, 1=description/other
const computeRelevanceScore = (
  query: string,
  fields: { title?: string; code?: string; description?: string }
): number => {
  const qLower = query.toLowerCase();
  const qNorm = normalize(query);
  if (fields.title && fields.title.toLowerCase().includes(qLower)) return 3;
  if (fields.code && normalize(fields.code).includes(qNorm)) return 2;
  return 1;
};

// Convert numeric element number to alphabetic: 1→a, 2→b, ..., 26→z
// NABH codes use letters for elements: HIC.1.b not HIC.1.2
const numToLetter = (num: string): string => {
  const n = parseInt(num, 10);
  if (isNaN(n) || n < 1 || n > 26) return num; // already a letter or out of range
  return String.fromCharCode(96 + n); // 1→a, 2→b, etc.
};

// Format objective code: "HIC.1.5" → "HIC.1.e", "COP.3.11" → "COP.3.k"
const formatObjectiveCode = (code: string): string => {
  if (!code || code === '-') return code;
  const parts = code.split('.');
  if (parts.length === 3 && /^\d+$/.test(parts[2])) {
    parts[2] = numToLetter(parts[2]);
  }
  return parts.join('.');
};

// Highlight matching text in a string by wrapping matches in a styled span
const highlightMatch = (text: string, query: string): ReactNode => {
  if (!query.trim()) return text;
  const stopWords = new Set(['and', 'or', 'of', 'the', 'in', 'to', 'a', 'an', 'is', 'it', 'for', 'on', 'at', 'by']);
  const words = query.trim().split(/\s+/)
    .filter(w => !stopWords.has(w.toLowerCase()))
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(w => w.length > 0);
  if (words.length === 0) return text;
  const regex = new RegExp(`(${words.join('|')})`, 'gi');
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} style={{ backgroundColor: '#fff176', fontWeight: 'bold', borderRadius: 2, padding: '0 2px' }}>{part}</span>
        ) : (
          part
        )
      )}
    </>
  );
};

// Extract full objective code from SOP title like "Risk assessment protocols (HIC.1.5)"
const extractCodeFromTitle = (title: string): string | null => {
  const match = title.match(/\(([A-Z]{2,4}\.\d+\.\d+)\)/);
  return match ? match[1] : null;
};

// Extract a ~120 char snippet around the first occurrence of the search term
const extractSnippet = (content: string | null | undefined, query: string): string => {
  if (!content) return '';
  const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase().trim();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.substring(0, 120) + (text.length > 120 ? '...' : '');
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + lowerQuery.length + 70);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
};

// Remove content results whose id already exists in metadata results
const deduplicateResults = (
  contentResults: SearchResult[],
  metadataResults: SearchResult[]
): SearchResult[] => {
  const existingIds = new Set(metadataResults.map(r => `${r.type}-${r.id}`));
  return contentResults.filter(r => !existingIds.has(`${r.type}-${r.id}`));
};

// Format SOP title: convert numeric codes in parentheses to alphabetic
const formatSOPTitle = (title: string): string => {
  return title.replace(/\(([A-Z]{2,4})\.(\d+)\.(\d+)\)/g, (_match, chapter, std, elem) => {
    return `(${chapter}.${std}.${numToLetter(elem)})`;
  });
};

export default function SearchPage() {
  const navigate = useNavigate();
  const { chapters } = useNABHStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchSource, setSearchSource] = useState<SearchSource>('all');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Content search state (Phase 2 - background)
  const [contentResults, setContentResults] = useState<SearchResult[]>([]);
  const [isContentSearching, setIsContentSearching] = useState(false);
  const contentSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadataResultsRef = useRef<SearchResult[]>([]);

  // Build autocomplete suggestions from local chapters data
  const suggestions = useMemo(() => {
    const items: string[] = [];
    chapters.forEach(chapter => {
      chapter.objectives.forEach(obj => {
        items.push(obj.code);
      });
    });
    return items;
  }, [chapters]);

  // Filtered autocomplete suggestions based on current query (normalized)
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = normalize(searchQuery);
    return suggestions
      .filter(s => normalize(s).includes(q))
      .slice(0, 15);
  }, [searchQuery, suggestions]);

  // Placeholder text based on dropdown
  const getPlaceholder = () => {
    switch (searchSource) {
      case 'sop': return 'Search SOPs by title, description, or chapter code...';
      case 'evidence': return 'Search evidences by title or objective code...';
      default: return 'Search across all SOPs, evidences, and objectives...';
    }
  };

  // Dropdown color based on selection
  const getDropdownColor = (): 'warning' | 'success' | 'primary' => {
    switch (searchSource) {
      case 'sop': return 'warning';
      case 'evidence': return 'success';
      default: return 'primary';
    }
  };

  // Search local objectives (normalized: "hic 4 a" matches "HIC.4.a")
  const searchLocalObjectives = (query: string): SearchResult[] => {
    const qNorm = normalize(query);
    const qLower = query.toLowerCase();
    const results: SearchResult[] = [];
    chapters.forEach(chapter => {
      chapter.objectives.forEach(obj => {
        const matches =
          normalize(obj.code).includes(qNorm) ||
          normalize(chapter.code).includes(qNorm) ||
          obj.title.toLowerCase().includes(qLower) ||
          obj.description.toLowerCase().includes(qLower);
        if (matches) {
          results.push({
            id: obj.id,
            type: 'objective',
            title: `${formatObjectiveCode(obj.code)} - ${obj.title}`,
            code: formatObjectiveCode(obj.code),
            chapter: chapter.code,
            priority: obj.isCore || obj.priority === 'CORE' ? 'high' : 'medium',
            url: `/objective/${chapter.id}/${obj.id}`,
            relevanceScore: computeRelevanceScore(query, { title: obj.title, code: obj.code, description: obj.description }),
          });
        }
      });
    });
    return results;
  };

  // Search Supabase for SOPs (both nabh_sop_documents and nabh_generated_sops)
  // Two-pass: first try specific query, if no results fall back to chapter prefix
  const searchSOPs = async (query: string): Promise<SearchResult[]> => {
    const q = `%${query.trim().replace(/[\s._\-,]+/g, '%')}%`;
    const results: SearchResult[] = [];

    // Search nabh_sop_documents (uploaded SOPs)
    const { data, error } = await supabase
      .from('nabh_sop_documents')
      .select('id, title, description, chapter_code')
      .or(`title.ilike.${q},description.ilike.${q},chapter_code.ilike.${q}`)
      .limit(50);

    if (!error && data) {
      data.forEach((sop: any) => {
        const title = sop.title || 'Untitled SOP';
        const extractedCode = extractCodeFromTitle(title);
        const displayCode = extractedCode ? formatObjectiveCode(extractedCode) : (sop.chapter_code || '-');
        results.push({
          id: sop.id,
          type: 'sop' as const,
          title: formatSOPTitle(title),
          code: displayCode,
          chapter: sop.chapter_code || '-',
          priority: 'medium' as const,
          url: `/sop/${sop.id}`,
          relevanceScore: computeRelevanceScore(query, { title, code: sop.chapter_code || '', description: sop.description || '' }),
        });
      });
    }

    // Search nabh_generated_sops (AI-generated SOPs)
    const { data: genData, error: genError } = await supabase
      .from('nabh_generated_sops')
      .select('id, objective_code, objective_title, chapter_code')
      .or(`objective_title.ilike.${q},objective_code.ilike.${q},chapter_code.ilike.${q}`)
      .limit(50);

    if (!genError && genData) {
      genData.forEach((sop: any) => {
        results.push({
          id: sop.id,
          type: 'sop' as const,
          title: sop.objective_title || 'Generated SOP',
          code: formatObjectiveCode(sop.objective_code || sop.chapter_code || '-'),
          chapter: sop.chapter_code || '-',
          priority: 'medium' as const,
          url: `/sop/${sop.id}`,
          relevanceScore: computeRelevanceScore(query, { title: sop.objective_title || '', code: sop.objective_code || sop.chapter_code || '' }),
        });
      });
    }

    if (results.length > 0) return results;

    // Fallback: search by chapter prefix (e.g., "AAC" from "AAC.2.a")
    const chapterPrefix = query.trim().match(/^([A-Za-z]+)/)?.[1] || '';
    if (!chapterPrefix) return [];

    const chapterQ = `%${chapterPrefix}%`;
    const fallbackResults: SearchResult[] = [];

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('nabh_sop_documents')
      .select('id, title, description, chapter_code')
      .or(`title.ilike.${chapterQ},chapter_code.ilike.${chapterQ}`)
      .limit(50);

    if (!fallbackError && fallbackData) {
      fallbackData.forEach((sop: any) => {
        const title = sop.title || 'Untitled SOP';
        const extractedCode = extractCodeFromTitle(title);
        const displayCode = extractedCode ? formatObjectiveCode(extractedCode) : (sop.chapter_code || '-');
        fallbackResults.push({
          id: sop.id,
          type: 'sop' as const,
          title: formatSOPTitle(title),
          code: displayCode,
          chapter: sop.chapter_code || '-',
          priority: 'medium' as const,
          url: `/sop/${sop.id}`,
          relevanceScore: computeRelevanceScore(query, { title, code: sop.chapter_code || '', description: sop.description || '' }),
        });
      });
    }

    const { data: genFallback } = await supabase
      .from('nabh_generated_sops')
      .select('id, objective_code, objective_title, chapter_code')
      .or(`objective_title.ilike.${chapterQ},chapter_code.ilike.${chapterQ}`)
      .limit(50);

    if (genFallback) {
      genFallback.forEach((sop: any) => {
        fallbackResults.push({
          id: sop.id,
          type: 'sop' as const,
          title: sop.objective_title || 'Generated SOP',
          code: formatObjectiveCode(sop.objective_code || sop.chapter_code || '-'),
          chapter: sop.chapter_code || '-',
          priority: 'medium' as const,
          url: `/sop/${sop.id}`,
          relevanceScore: computeRelevanceScore(query, { title: sop.objective_title || '', code: sop.objective_code || sop.chapter_code || '' }),
        });
      });
    }

    return fallbackResults;
  };

  // Search Supabase for Evidences (both tables, fuzzy with wildcards)
  // Two-pass: first try specific query, if no results fall back to chapter prefix
  const searchEvidences = async (query: string): Promise<SearchResult[]> => {
    const q = `%${query.trim().replace(/[\s._\-,]+/g, '%')}%`;
    const results: SearchResult[] = [];

    // Search nabh_ai_generated_evidence
    const { data: aiData } = await supabase
      .from('nabh_ai_generated_evidence')
      .select('id, evidence_title, objective_code')
      .or(`evidence_title.ilike.${q},objective_code.ilike.${q}`)
      .limit(50);

    if (aiData) {
      aiData.forEach((ev: any) => {
        results.push({
          id: ev.id,
          type: 'evidence',
          title: ev.evidence_title || 'Untitled Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          relevanceScore: computeRelevanceScore(query, { title: ev.evidence_title || '', code: ev.objective_code || '' }),
        });
      });
    }

    // Search nabh_document_evidence
    const { data: docData } = await supabase
      .from('nabh_document_evidence')
      .select('id, title, objective_code')
      .or(`title.ilike.${q},objective_code.ilike.${q}`)
      .limit(50);

    if (docData) {
      docData.forEach((ev: any) => {
        results.push({
          id: ev.id,
          type: 'evidence',
          title: ev.title || 'Untitled Document Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          relevanceScore: computeRelevanceScore(query, { title: ev.title || '', code: ev.objective_code || '' }),
        });
      });
    }

    // If specific search found results, return them
    if (results.length > 0) return results;

    // Fallback: search by chapter prefix (e.g., "AAC" from "AAC.2.a")
    const chapterPrefix = query.trim().match(/^([A-Za-z]+)/)?.[1] || '';
    if (!chapterPrefix) return [];

    const chapterQ = `%${chapterPrefix}%`;
    const fallbackResults: SearchResult[] = [];

    const { data: aiFallback } = await supabase
      .from('nabh_ai_generated_evidence')
      .select('id, evidence_title, objective_code')
      .or(`evidence_title.ilike.${chapterQ},objective_code.ilike.${chapterQ}`)
      .limit(50);

    if (aiFallback) {
      aiFallback.forEach((ev: any) => {
        fallbackResults.push({
          id: ev.id,
          type: 'evidence',
          title: ev.evidence_title || 'Untitled Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          relevanceScore: computeRelevanceScore(query, { title: ev.evidence_title || '', code: ev.objective_code || '' }),
        });
      });
    }

    const { data: docFallback } = await supabase
      .from('nabh_document_evidence')
      .select('id, title, objective_code')
      .or(`title.ilike.${chapterQ},objective_code.ilike.${chapterQ}`)
      .limit(50);

    if (docFallback) {
      docFallback.forEach((ev: any) => {
        fallbackResults.push({
          id: ev.id,
          type: 'evidence',
          title: ev.title || 'Untitled Document Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          relevanceScore: computeRelevanceScore(query, { title: ev.title || '', code: ev.objective_code || '' }),
        });
      });
    }

    return fallbackResults;
  };

  // Search SOP content fields (Phase 2 - background)
  const searchSOPsContent = async (query: string): Promise<SearchResult[]> => {
    const q = `%${query.trim().replace(/[\s._\-,]+/g, '%')}%`;
    const results: SearchResult[] = [];

    // Search nabh_sop_documents by extracted_content
    const { data } = await supabase
      .from('nabh_sop_documents')
      .select('id, title, chapter_code, extracted_content')
      .ilike('extracted_content', q)
      .limit(30);

    if (data) {
      data.forEach((sop: any) => {
        const title = sop.title || 'Untitled SOP';
        const extractedCode = extractCodeFromTitle(title);
        const displayCode = extractedCode ? formatObjectiveCode(extractedCode) : (sop.chapter_code || '-');
        results.push({
          id: sop.id,
          type: 'sop',
          title: formatSOPTitle(title),
          code: displayCode,
          chapter: sop.chapter_code || '-',
          priority: 'medium',
          url: `/sop/${sop.id}`,
          foundVia: 'content',
          contentSnippet: extractSnippet(sop.extracted_content, query),
        });
      });
    }

    // Search nabh_generated_sops by sop_html_content (sop_text_content is not populated)
    const { data: genData } = await supabase
      .from('nabh_generated_sops')
      .select('id, objective_code, objective_title, chapter_code, sop_html_content')
      .ilike('sop_html_content', q)
      .limit(30);

    if (genData) {
      genData.forEach((sop: any) => {
        results.push({
          id: sop.id,
          type: 'sop',
          title: sop.objective_title || 'Generated SOP',
          code: formatObjectiveCode(sop.objective_code || sop.chapter_code || '-'),
          chapter: sop.chapter_code || '-',
          priority: 'medium',
          url: `/sop/${sop.id}`,
          foundVia: 'content',
          contentSnippet: extractSnippet(sop.sop_html_content, query),
        });
      });
    }

    return results;
  };

  // Search Evidence content fields (Phase 2 - background)
  const searchEvidencesContent = async (query: string): Promise<SearchResult[]> => {
    const q = `%${query.trim().replace(/[\s._\-,]+/g, '%')}%`;
    const results: SearchResult[] = [];

    // Search nabh_ai_generated_evidence by generated_content (plain text)
    const { data: aiData } = await supabase
      .from('nabh_ai_generated_evidence')
      .select('id, evidence_title, objective_code, generated_content')
      .ilike('generated_content', q)
      .limit(30);

    if (aiData) {
      aiData.forEach((ev: any) => {
        results.push({
          id: ev.id,
          type: 'evidence',
          title: ev.evidence_title || 'Untitled Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          foundVia: 'content',
          contentSnippet: extractSnippet(ev.generated_content, query),
        });
      });
    }

    // Search nabh_document_evidence by html_content (only content field available)
    const { data: docData } = await supabase
      .from('nabh_document_evidence')
      .select('id, title, objective_code, html_content')
      .ilike('html_content', q)
      .limit(30);

    if (docData) {
      docData.forEach((ev: any) => {
        results.push({
          id: ev.id,
          type: 'evidence',
          title: ev.title || 'Untitled Document Evidence',
          code: formatObjectiveCode(ev.objective_code || '-'),
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
          foundVia: 'content',
          contentSnippet: extractSnippet(ev.html_content, query),
        });
      });
    }

    return results;
  };

  // Main search function with debounce (two-phase: metadata first, content second)
  useEffect(() => {
    // Clear Phase 1 timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    // Clear Phase 2 timeout
    if (contentSearchTimeoutRef.current) {
      clearTimeout(contentSearchTimeoutRef.current);
      contentSearchTimeoutRef.current = null;
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setContentResults([]);
      setIsSearching(false);
      setIsContentSearching(false);
      metadataResultsRef.current = [];
      return;
    }

    setIsSearching(true);
    setIsContentSearching(true);

    // PHASE 1: Metadata search (400ms debounce - same as before)
    searchTimeoutRef.current = setTimeout(async () => {
      const query = searchQuery.trim();
      let results: SearchResult[] = [];

      try {
        if (searchSource === 'sop') {
          results = await searchSOPs(query);
        } else if (searchSource === 'evidence') {
          results = await searchEvidences(query);
        } else {
          const [localResults, sopResults, evidenceResults] = await Promise.all([
            Promise.resolve(searchLocalObjectives(query)),
            searchSOPs(query),
            searchEvidences(query),
          ]);
          results = [...localResults, ...sopResults, ...evidenceResults];
        }
      } catch (err) {
        console.error('Search error:', err);
      }

      // Sort by relevance: title matches (3) first, then code (2), then description (1)
      results.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

      metadataResultsRef.current = results;
      setSearchResults(results);
      setIsSearching(false);

      // Add to recent searches
      setRecentSearches(prev => {
        if (prev.includes(query)) return prev;
        return [query, ...prev.slice(0, 4)];
      });
    }, 400);

    // PHASE 2: Content search (800ms debounce - fires later, non-blocking)
    contentSearchTimeoutRef.current = setTimeout(async () => {
      const query = searchQuery.trim();
      let cResults: SearchResult[] = [];

      try {
        if (searchSource === 'sop') {
          cResults = await searchSOPsContent(query);
        } else if (searchSource === 'evidence') {
          cResults = await searchEvidencesContent(query);
        } else {
          const [sopContentResults, evidenceContentResults] = await Promise.all([
            searchSOPsContent(query),
            searchEvidencesContent(query),
          ]);
          cResults = [...sopContentResults, ...evidenceContentResults];
        }
      } catch (err) {
        console.error('Content search error:', err);
      }

      // Deduplicate against Phase 1 metadata results
      const unique = deduplicateResults(cResults, metadataResultsRef.current);
      setContentResults(unique);
      setIsContentSearching(false);
    }, 800);

    // Cleanup on unmount or re-render
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (contentSearchTimeoutRef.current) clearTimeout(contentSearchTimeoutRef.current);
    };
  }, [searchQuery, searchSource]);

  // Handle search input
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  // Clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setContentResults([]);
    setIsSearching(false);
    setIsContentSearching(false);
    metadataResultsRef.current = [];
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (contentSearchTimeoutRef.current) {
      clearTimeout(contentSearchTimeoutRef.current);
      contentSearchTimeoutRef.current = null;
    }
  };

  // Handle suggestion click - fills search bar to trigger search in selected source
  const handleSuggestionClick = (code: string) => {
    setSearchQuery(code);
  };

  // Navigate to result (pass search query so destination can highlight matches)
  const handleResultClick = (result: SearchResult) => {
    navigate(`${result.url}?q=${encodeURIComponent(searchQuery)}`);
  };

  // Get type chip color
  const getTypeChipColor = (type: string): 'warning' | 'success' | 'info' => {
    switch (type) {
      case 'sop': return 'warning';
      case 'evidence': return 'success';
      case 'objective': return 'info';
      default: return 'info';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <SearchIcon sx={{ color: 'primary.main', fontSize: 32 }} />
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold">
              Global Search
            </Typography>
            <Typography variant="subtitle1" color="text.secondary">
              Search across all SOPs, evidences, and objectives
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Search Input with Dropdown */}
      <Paper elevation={2} sx={{ mb: 3 }}>
        <Box p={3}>
          <Box display="flex" gap={2} alignItems="center">
            {/* Source Dropdown */}
            <FormControl sx={{ minWidth: 160 }}>
              <Select
                value={searchSource}
                onChange={(e) => setSearchSource(e.target.value as SearchSource)}
                size="small"
                color={getDropdownColor()}
                sx={{
                  borderRadius: 3,
                  fontWeight: 'bold',
                  '& .MuiSelect-select': { py: 1.5 },
                }}
              >
                <MenuItem value="all">All Sources</MenuItem>
                <MenuItem value="sop">SOPs</MenuItem>
                <MenuItem value="evidence">Evidences</MenuItem>
              </Select>
            </FormControl>

            {/* Search Input */}
            <TextField
              fullWidth
              placeholder={getPlaceholder()}
              value={searchQuery}
              onChange={handleSearchChange}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleClearSearch}>
                        <ClearIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  fontSize: '1.1rem',
                  borderRadius: 3,
                }
              }}
            />
          </Box>

          {/* Loading Indicator */}
          {isSearching && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress color={getDropdownColor()} />
              <Box display="flex" alignItems="center" justifyContent="center" gap={2} mt={2}>
                <CircularProgress size={20} color={getDropdownColor()} />
                <Typography variant="body2" color="text.secondary">
                  Searching database...
                </Typography>
              </Box>
            </Box>
          )}

          {/* Autocomplete Suggestions (instant, from local data) - click fills search bar */}
          {filteredSuggestions.length > 0 && searchQuery && (
            <Box mt={2}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>
                Suggestions:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {filteredSuggestions.map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    variant="outlined"
                    size="small"
                    onClick={() => handleSuggestionClick(suggestion)}
                    clickable
                    color="primary"
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Recent Searches */}
          {recentSearches.length > 0 && !searchQuery && (
            <Box mt={2}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>
                Recent Searches:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {recentSearches.map((search, index) => (
                  <Chip
                    key={index}
                    label={search}
                    variant="outlined"
                    size="small"
                    onClick={() => setSearchQuery(search)}
                    clickable
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Popular Searches (when empty) */}
          {!searchQuery && (
            <Box mt={2}>
              <Typography variant="subtitle2" color="text.secondary" mb={1}>
                Popular Searches:
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {['AAC', 'COP', 'HIC', 'hand hygiene', 'admission process', 'infection control', 'pain assessment'].map((suggestion) => (
                  <Chip
                    key={suggestion}
                    label={suggestion}
                    variant="outlined"
                    size="small"
                    onClick={() => setSearchQuery(suggestion)}
                    clickable
                    color="primary"
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Search Results Table */}
      {searchQuery && !isSearching && searchResults.length > 0 && (
        <Box>
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary">
              Found {searchResults.length} results for "{searchQuery}"
              {contentResults.length > 0 && ` + ${contentResults.length} from content`}
              {searchSource !== 'all' && ` in ${searchSource === 'sop' ? 'SOPs' : 'Evidences'}`}
            </Typography>
          </Box>

          <TableContainer component={Paper} elevation={2}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Title / Evidence</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Chapter</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {searchResults.map((result, index) => (
                  <TableRow
                    key={`${result.type}-${result.id}`}
                    hover
                    sx={{
                      cursor: 'pointer',
                      bgcolor: index % 2 === 0 ? 'grey.50' : 'white',
                    }}
                    onClick={() => handleResultClick(result)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                        {highlightMatch(result.code, searchQuery)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {highlightMatch(result.title, searchQuery)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={result.type.toUpperCase()}
                        size="small"
                        color={getTypeChipColor(result.type)}
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{highlightMatch(result.chapter || '-', searchQuery)}</Typography>
                    </TableCell>
                    <TableCell>
                      {result.priority === 'high' ? (
                        <Chip label="CORE" size="small" color="error" variant="filled" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        <Tooltip title="View" arrow>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResultClick(result);
                            }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in New Tab" arrow>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`${result.url}?q=${encodeURIComponent(searchQuery)}`, '_blank');
                            }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Content Search Loading Indicator (Phase 2) */}
      {searchQuery && isContentSearching && !isSearching && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={16} color="secondary" />
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            Searching document contents...
          </Typography>
        </Box>
      )}

      {/* Content Search Results (Phase 2 - found in document body) */}
      {searchQuery && !isContentSearching && contentResults.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            <Chip
              label={`${contentResults.length} results from document content`}
              size="small"
              color="secondary"
              variant="outlined"
              icon={<SearchIcon sx={{ fontSize: 16 }} />}
            />
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>

          <TableContainer component={Paper} elevation={1} sx={{ bgcolor: 'grey.50' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.200' }}>
                  <TableCell sx={{ fontWeight: 'bold' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Title / Evidence</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Content Match</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contentResults.map((result, index) => (
                  <TableRow
                    key={`content-${result.type}-${result.id}`}
                    hover
                    sx={{
                      cursor: 'pointer',
                      bgcolor: index % 2 === 0 ? 'grey.50' : 'white',
                    }}
                    onClick={() => handleResultClick(result)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>
                        {highlightMatch(result.code, searchQuery)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {highlightMatch(result.title, searchQuery)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={result.type.toUpperCase()}
                        size="small"
                        color={getTypeChipColor(result.type)}
                        variant="filled"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          fontStyle: 'italic',
                        }}
                      >
                        {result.contentSnippet
                          ? highlightMatch(result.contentSnippet, searchQuery)
                          : 'Found in document content'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box display="flex" justifyContent="center" gap={0.5}>
                        <Tooltip title="View" arrow>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResultClick(result);
                            }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open in New Tab" arrow>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`${result.url}?q=${encodeURIComponent(searchQuery)}`, '_blank');
                            }}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* No Results */}
      {searchQuery && !isSearching && !isContentSearching && searchResults.length === 0 && contentResults.length === 0 && (
        <Alert severity="info">
          <Typography variant="body1">
            No results found for "{searchQuery}". Try different keywords or check spelling.
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Search Tips:</strong>
            <br />- Use specific terms like "hand hygiene", "admission", "quality committee"
            <br />- Try chapter codes like "AAC", "COP", "HIC"
            <br />- Switch the dropdown to search only SOPs or Evidences
          </Typography>
        </Alert>
      )}

      {/* Empty State */}
      {!searchQuery && (
        <Box textAlign="center" py={8}>
          <SearchIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h5" color="text.secondary" mb={1}>
            Search NABH System
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Find SOPs, evidences, and objectives across the entire NABH system.
            <br />
            Use the dropdown to filter by SOPs or Evidences.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
