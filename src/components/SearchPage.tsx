import { useState, useMemo, useEffect, useRef } from 'react';
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
}

type SearchSource = 'all' | 'sop' | 'evidence';

// Normalize string for fuzzy matching: "hic 4 a" matches "HIC.4.a"
const normalize = (str: string) => str.toLowerCase().replace(/[\s._\-,]/g, '');

export default function SearchPage() {
  const navigate = useNavigate();
  const { chapters } = useNABHStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [searchSource, setSearchSource] = useState<SearchSource>('all');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            title: `${obj.code} - ${obj.title}`,
            code: obj.code,
            chapter: chapter.code,
            priority: obj.isCore || obj.priority === 'CORE' ? 'high' : 'medium',
            url: `/objective/${chapter.id}/${obj.id}`,
          });
        }
      });
    });
    return results;
  };

  // Search Supabase for SOPs (spaces/dots become % wildcards for fuzzy match)
  // Two-pass: first try specific query, if no results fall back to chapter prefix
  const searchSOPs = async (query: string): Promise<SearchResult[]> => {
    const q = `%${query.trim().replace(/[\s._\-,]+/g, '%')}%`;

    const { data, error } = await supabase
      .from('nabh_sop_documents')
      .select('id, title, description, chapter_code')
      .or(`title.ilike.${q},description.ilike.${q},chapter_code.ilike.${q}`)
      .limit(50);

    // If specific search returned results, use them
    if (!error && data && data.length > 0) {
      return data.map((sop: any) => ({
        id: sop.id,
        type: 'sop' as const,
        title: sop.title || 'Untitled SOP',
        code: sop.chapter_code || '-',
        chapter: sop.chapter_code || '-',
        priority: 'medium' as const,
        url: `/sop/${sop.id}`,
      }));
    }

    // Fallback: search by chapter prefix (e.g., "AAC" from "AAC.2.a")
    const chapterPrefix = query.trim().match(/^([A-Za-z]+)/)?.[1] || '';
    if (!chapterPrefix) return [];

    const chapterQ = `%${chapterPrefix}%`;
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('nabh_sop_documents')
      .select('id, title, description, chapter_code')
      .or(`title.ilike.${chapterQ},chapter_code.ilike.${chapterQ}`)
      .limit(50);

    if (fallbackError || !fallbackData) return [];
    return fallbackData.map((sop: any) => ({
      id: sop.id,
      type: 'sop' as const,
      title: sop.title || 'Untitled SOP',
      code: sop.chapter_code || '-',
      chapter: sop.chapter_code || '-',
      priority: 'medium' as const,
      url: `/sop/${sop.id}`,
    }));
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
          code: ev.objective_code || '-',
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
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
          code: ev.objective_code || '-',
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
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
          code: ev.objective_code || '-',
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
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
          code: ev.objective_code || '-',
          chapter: ev.objective_code ? ev.objective_code.split('.')[0] : '-',
          priority: 'medium',
          url: `/evidence/${ev.id}`,
        });
      });
    }

    return fallbackResults;
  };

  // Main search function with debounce
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      const query = searchQuery.trim();
      let results: SearchResult[] = [];

      try {
        if (searchSource === 'sop') {
          results = await searchSOPs(query);
        } else if (searchSource === 'evidence') {
          results = await searchEvidences(query);
        } else {
          // All: local objectives + SOPs + Evidences
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

      setSearchResults(results);
      setIsSearching(false);

      // Add to recent searches
      setRecentSearches(prev => {
        if (prev.includes(query)) return prev;
        return [query, ...prev.slice(0, 4)];
      });
    }, 400);

    // Cleanup on unmount or re-render
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
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
    setIsSearching(false);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  };

  // Handle suggestion click - fills search bar to trigger search in selected source
  const handleSuggestionClick = (code: string) => {
    setSearchQuery(code);
  };

  // Navigate to result
  const handleResultClick = (result: SearchResult) => {
    navigate(result.url);
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
                        {result.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={result.title} arrow>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {result.title}
                        </Typography>
                      </Tooltip>
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
                      <Typography variant="body2">{result.chapter || '-'}</Typography>
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
                              window.open(result.url, '_blank');
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
      {searchQuery && !isSearching && searchResults.length === 0 && (
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
