/**
 * Highlight search terms inside HTML content (safe for iframe srcDoc).
 * Only highlights text nodes — never modifies tag attributes or tag names.
 */

const STOP_WORDS = new Set(['and', 'or', 'of', 'the', 'in', 'to', 'a', 'an', 'is', 'it', 'for', 'on', 'at', 'by']);

export function highlightSearchTerms(html: string, query: string): string {
  if (!query || !query.trim() || !html) return html;

  // Split query into words, filter out short stop words
  const words = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 || !STOP_WORDS.has(w.toLowerCase()))
    .filter((w) => w.length > 0);

  if (words.length === 0) return html;

  // Build regex that matches any of the search words (case-insensitive)
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  // Split HTML into tags and text segments, only highlight inside text
  // This regex splits on HTML tags (including comments and doctype)
  const parts = html.split(/(<[^>]*>)/g);

  const highlighted = parts
    .map((part) => {
      // If it looks like an HTML tag, leave it alone
      if (part.startsWith('<')) return part;
      // Replace matches in text content
      return part.replace(pattern, '<mark class="search-hl">$1</mark>');
    })
    .join('');

  // Inject highlight styles and auto-scroll script
  const highlightStyle = `<style>.search-hl{background:#fff176;font-weight:bold;border-radius:2px;padding:0 2px;scroll-margin-top:40px}</style>`;
  const scrollScript = `<script>document.addEventListener('DOMContentLoaded',function(){var m=document.querySelector('.search-hl');if(m)m.scrollIntoView({behavior:'smooth',block:'center'})});setTimeout(function(){var m=document.querySelector('.search-hl');if(m)m.scrollIntoView({behavior:'smooth',block:'center'})},300);<\/script>`;

  // Insert style + script: before </head> if exists, else before </body>, else prepend
  if (highlighted.includes('</head>')) {
    return highlighted.replace('</head>', `${highlightStyle}${scrollScript}</head>`);
  }
  if (highlighted.includes('</body>')) {
    return highlighted.replace('</body>', `${highlightStyle}${scrollScript}</body>`);
  }
  return highlightStyle + scrollScript + highlighted;
}
