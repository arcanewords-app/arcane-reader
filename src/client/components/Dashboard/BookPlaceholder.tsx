/**
 * Beautiful placeholder component for book cards
 * Generates unique patterns based on project name and type
 */

interface BookPlaceholderProps {
  projectName: string;
  projectType: 'book' | 'text';
  class?: string;
}

/**
 * Generate a deterministic color palette based on project name
 */
function generateColorPalette(seed: string): {
  primary: string;
  secondary: string;
  accent: string;
  pattern: string;
} {
  // Simple hash function to convert string to number
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Generate colors based on hash
  const hue = Math.abs(hash) % 360;
  const saturation = 40 + (Math.abs(hash) % 30); // 40-70%
  const lightness = 20 + (Math.abs(hash) % 15); // 20-35%
  
  const primary = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  const secondary = `hsl(${(hue + 30) % 360}, ${saturation}%, ${lightness + 5}%)`;
  const accent = `hsl(${(hue + 60) % 360}, ${Math.min(saturation + 20, 80)}%, ${Math.min(lightness + 10, 50)}%)`;
  
  // Pattern type based on hash
  const patternTypes = ['dots', 'lines', 'grid', 'waves'];
  const pattern = patternTypes[Math.abs(hash) % patternTypes.length];
  
  return { primary, secondary, accent, pattern };
}

/**
 * Book placeholder SVG (for type: 'book')
 */
function BookPlaceholderSVG({ colors, uniqueId }: { colors: ReturnType<typeof generateColorPalette>; uniqueId: string }) {
  const { primary, secondary, accent, pattern } = colors;
  
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }}
    >
      <defs>
        {/* Gradient background */}
        <linearGradient id={`bookGradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primary} stopOpacity="0.8" />
          <stop offset="50%" stopColor={secondary} stopOpacity="0.6" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.4" />
        </linearGradient>
        
        {/* Pattern definitions */}
        <pattern id={`dotsPattern-${uniqueId}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1.5" fill={accent} opacity="0.3" />
        </pattern>
        
        <pattern id={`linesPattern-${uniqueId}`} x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="30" y2="30" stroke={accent} strokeWidth="0.5" opacity="0.2" />
        </pattern>
        
        <pattern id={`gridPattern-${uniqueId}`} x="0" y="0" width="25" height="25" patternUnits="userSpaceOnUse">
          <rect width="25" height="25" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.15" />
        </pattern>
        
        <pattern id={`wavesPattern-${uniqueId}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 0,20 Q 10,10 20,20 T 40,20" stroke={accent} strokeWidth="1" fill="none" opacity="0.2" />
        </pattern>
      </defs>
      
      {/* Background */}
      <rect width="200" height="300" fill={`url(#bookGradient-${uniqueId})`} />
      
      {/* Pattern overlay */}
      <rect
        width="200"
        height="300"
        fill={`url(#${pattern}Pattern-${uniqueId})`}
      />
      
      {/* Book spine effect */}
      <rect x="0" y="0" width="8" height="300" fill={accent} opacity="0.4" />
      
      {/* Decorative elements */}
      <circle cx="100" cy="80" r="25" fill={accent} opacity="0.15" />
      <circle cx="100" cy="220" r="30" fill={secondary} opacity="0.1" />
      
      {/* Book cover lines */}
      <line x1="20" y1="100" x2="180" y2="100" stroke={accent} strokeWidth="1.5" opacity="0.3" />
      <line x1="20" y1="130" x2="180" y2="130" stroke={accent} strokeWidth="1" opacity="0.2" />
      <line x1="20" y1="160" x2="180" y2="160" stroke={accent} strokeWidth="1" opacity="0.2" />
    </svg>
  );
}

/**
 * Text document placeholder SVG (for type: 'text')
 */
function TextPlaceholderSVG({ colors, uniqueId }: { colors: ReturnType<typeof generateColorPalette>; uniqueId: string }) {
  const { primary, secondary, accent, pattern } = colors;
  
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }}
    >
      <defs>
        {/* Gradient background */}
        <linearGradient id={`textGradient-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={primary} stopOpacity="0.7" />
          <stop offset="50%" stopColor={secondary} stopOpacity="0.5" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.3" />
        </linearGradient>
        
        {/* Pattern definitions */}
        <pattern id={`textDotsPattern-${uniqueId}`} x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1.5" fill={accent} opacity="0.25" />
        </pattern>
        
        <pattern id={`textLinesPattern-${uniqueId}`} x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="30" y2="30" stroke={accent} strokeWidth="0.5" opacity="0.15" />
        </pattern>
        
        <pattern id={`textGridPattern-${uniqueId}`} x="0" y="0" width="25" height="25" patternUnits="userSpaceOnUse">
          <rect width="25" height="25" fill="none" stroke={accent} strokeWidth="0.5" opacity="0.12" />
        </pattern>
        
        <pattern id={`textWavesPattern-${uniqueId}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 0,20 Q 10,10 20,20 T 40,20" stroke={accent} strokeWidth="1" fill="none" opacity="0.15" />
        </pattern>
      </defs>
      
      {/* Background */}
      <rect width="200" height="300" fill={`url(#textGradient-${uniqueId})`} />
      
      {/* Pattern overlay */}
      <rect
        width="200"
        height="300"
        fill={`url(#text${pattern.charAt(0).toUpperCase() + pattern.slice(1)}Pattern-${uniqueId})`}
      />
      
      {/* Document corner fold */}
      <path
        d="M 160 0 L 200 0 L 200 40 L 160 0 Z"
        fill={accent}
        opacity="0.2"
      />
      
      {/* Text lines simulation */}
      <line x1="30" y1="80" x2="170" y2="80" stroke={accent} strokeWidth="2" opacity="0.3" />
      <line x1="30" y1="110" x2="150" y2="110" stroke={accent} strokeWidth="1.5" opacity="0.25" />
      <line x1="30" y1="140" x2="170" y2="140" stroke={accent} strokeWidth="1.5" opacity="0.25" />
      <line x1="30" y1="170" x2="140" y2="170" stroke={accent} strokeWidth="1.5" opacity="0.25" />
      <line x1="30" y1="200" x2="160" y2="200" stroke={accent} strokeWidth="1.5" opacity="0.25" />
      <line x1="30" y1="230" x2="150" y2="230" stroke={accent} strokeWidth="1.5" opacity="0.25" />
      
      {/* Decorative elements */}
      <circle cx="100" cy="50" r="20" fill={accent} opacity="0.1" />
    </svg>
  );
}

/**
 * Generate unique ID based on project name
 */
function generateUniqueId(projectName: string): string {
  let hash = 0;
  for (let i = 0; i < projectName.length; i++) {
    hash = projectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash).toString(36);
}

export function BookPlaceholder({ projectName, projectType, class: className = '' }: BookPlaceholderProps) {
  const colors = generateColorPalette(projectName);
  const uniqueId = generateUniqueId(projectName);
  
  return (
    <div class={`book-placeholder ${className}`}>
      {projectType === 'book' ? (
        <BookPlaceholderSVG colors={colors} uniqueId={uniqueId} />
      ) : (
        <TextPlaceholderSVG colors={colors} uniqueId={uniqueId} />
      )}
    </div>
  );
}
