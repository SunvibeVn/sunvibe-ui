/** Brand illustration for the auth pages: buildings, an AI chat bubble and a match card. */
export function AuthIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 300" className={className} role="img" aria-label="Apartments matched to tenants by Sunvibe AI">
      <defs>
        <linearGradient id="auth-illus-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="35%" stopColor="#f43f5e" />
          <stop offset="70%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="auth-illus-cool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>

      <ellipse cx="200" cy="268" rx="170" ry="14" fill="white" fillOpacity="0.06" />

      {/* Tall glass tower */}
      <rect x="78" y="58" width="104" height="208" rx="14" fill="white" fillOpacity="0.06" stroke="white" strokeOpacity="0.18" />
      {[0, 1, 2, 3, 4, 5].map((row) =>
        [0, 1, 2].map((col) => (
          <rect
            key={`t-${row}-${col}`}
            x={94 + col * 28}
            y={78 + row * 28}
            width="18"
            height="14"
            rx="3"
            fill={(row + col) % 4 === 1 ? "url(#auth-illus-cool)" : "white"}
            fillOpacity={(row + col) % 4 === 1 ? 1 : 0.18}
          />
        )),
      )}

      {/* Gradient apartment block */}
      <rect x="192" y="118" width="124" height="148" rx="14" fill="url(#auth-illus-brand)" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`a-${row}-${col}`} x={208 + col * 34} y={136 + row * 30} width="22" height="16" rx="3" fill="#04052b" fillOpacity="0.35" />
        )),
      )}
      <rect x="240" y="226" width="28" height="40" rx="5" fill="#04052b" fillOpacity="0.45" />

      {/* AI assistant bubble */}
      <g transform="translate(286 44)">
        <path d="M0 18a18 18 0 0 1 18-18h52a18 18 0 0 1 18 18v14a18 18 0 0 1-18 18H26l-14 12v-13A18 18 0 0 1 0 32Z" fill="white" />
        <circle cx="30" cy="25" r="4" fill="#7c3aed" />
        <circle cx="44" cy="25" r="4" fill="#a855f7" />
        <circle cx="58" cy="25" r="4" fill="#22d3ee" />
      </g>

      {/* Match card */}
      <g transform="translate(22 182)">
        <rect width="118" height="54" rx="14" fill="white" />
        <circle cx="26" cy="27" r="13" fill="url(#auth-illus-cool)" />
        <rect x="46" y="16" width="52" height="8" rx="4" fill="#0c0e45" fillOpacity="0.8" />
        <rect x="46" y="31" width="38" height="7" rx="3.5" fill="#7c3aed" fillOpacity="0.35" />
      </g>

      {/* Sparkles */}
      <path d="M352 150l4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#22d3ee" fillOpacity="0.9" />
      <path d="M50 92l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#f97316" fillOpacity="0.9" />
    </svg>
  );
}
