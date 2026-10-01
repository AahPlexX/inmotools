// Feature 35 — Non-Intrusive Context-Aware Tooltip & Metric Glossary data.
// One definition per technical term referenced anywhere in this tool's
// findings. Kept as flat plain-language strings so both the hover tooltip
// (desktop) and tap-triggered modal sheet (mobile) can share one source.

export interface GlossaryEntry { term: string; definition: string }

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'protocol': { term: 'Protocol / Scheme', definition: 'The method used to communicate with a server, such as http or https. https encrypts traffic; http does not.' },
  'idn': { term: 'Internationalized Domain Name (IDN)', definition: 'A domain name containing non-ASCII characters, stored internally in ASCII-compatible "punycode" form (xn--...).' },
  'punycode': { term: 'Punycode', definition: 'The ASCII-only encoding (prefixed xn--) browsers use to represent Unicode characters in a domain name.' },
  'homoglyph': { term: 'Homoglyph', definition: 'A character from a different alphabet that looks nearly identical to a Latin letter, e.g. Cyrillic а vs Latin a — a common phishing trick.' },
  'entropy': { term: 'Shannon Entropy', definition: 'A measure (in bits) of how unpredictable a string\'s characters are. Very high entropy often means a random or machine-generated name.' },
  'dga': { term: 'Domain Generation Algorithm (DGA)', definition: 'Malware technique that programmatically generates many random-looking domain names to evade blocklists.' },
  'typosquatting': { term: 'Typosquatting', definition: 'Registering a domain that is a near-miss misspelling of a popular brand, hoping for mistyped visits.' },
  'levenshtein': { term: 'Levenshtein (Edit) Distance', definition: 'The minimum number of single-character insertions, deletions, or substitutions needed to turn one string into another.' },
  'tracking-token': { term: 'Tracking Token', definition: 'A query parameter (like utm_source or fbclid) that identifies you or your click for analytics/advertising purposes.' },
  'shortener': { term: 'URL Shortener', definition: 'A service that maps a short link to a longer destination URL, which can hide the real destination until followed.' },
  'ttl': { term: 'TTL (Time To Live)', definition: 'How many seconds a DNS answer may be cached before a resolver must ask again.' },
  'ipv6': { term: 'IPv6', definition: 'The current-generation Internet Protocol addressing scheme, designed to succeed the exhausted IPv4 address space.' },
  'aaaa-record': { term: 'AAAA Record', definition: 'The DNS record type that maps a hostname to an IPv6 address (the IPv6 counterpart of an A record).' },
  'nameserver': { term: 'Nameserver (NS)', definition: 'A server that authoritatively answers DNS queries for a domain.' },
  'caa': { term: 'CAA Record', definition: 'A DNS record that restricts which Certificate Authorities are allowed to issue TLS certificates for a domain.' },
  'dnssec': { term: 'DNSSEC', definition: 'A DNS security extension that cryptographically signs records so resolvers can verify they were not forged or tampered with in transit.' },
  'rrsig': { term: 'RRSIG Record', definition: 'The DNSSEC signature record that proves a DNS record set is authentic.' },
  'dnskey': { term: 'DNSKEY Record', definition: 'The public key a DNSSEC-signed zone publishes so resolvers can verify its RRSIG signatures.' },
  'asn': { term: 'Autonomous System Number (ASN)', definition: 'A unique number identifying a network operator (ISP, cloud provider, company) on the internet\'s routing system (BGP).' },
  'geoip': { term: 'GeoIP', definition: 'Estimating the physical location (country/city) of a server from its IP address using commercial or public geolocation databases.' },
  'anycast': { term: 'Anycast', definition: 'A routing technique where the same IP address is announced from many locations; the network automatically routes you to the nearest one.' },
  'domain-age': { term: 'Domain Age', definition: 'How long ago a domain was first registered. Very new domains are statistically over-represented in abuse and phishing.' },
  'nrd': { term: 'Newly Registered Domain (NRD)', definition: 'Security shorthand for a domain registered very recently (commonly under 30 days), a common phishing-infrastructure signal.' },
  'domain-expiration': { term: 'Domain Expiration', definition: 'The date a domain registration lapses unless renewed. An expired domain can be re-registered by anyone.' },
  'registry-status': { term: 'Registry (EPP) Status Code', definition: 'Standardized codes (e.g. clientTransferProhibited, redemptionPeriod) that describe a domain\'s current lifecycle/lock state at the registry.' },
  'dnsbl': { term: 'DNSBL (DNS Blackhole List)', definition: 'A DNS-queryable blocklist of IPs/domains associated with spam, malware, or abuse.' },
  'san': { term: 'Subject Alternative Name (SAN)', definition: 'The list of hostnames a TLS certificate is valid for, beyond its primary common name.' },
  'certificate-transparency': { term: 'Certificate Transparency (CT)', definition: 'Public, append-only logs of every publicly trusted TLS certificate ever issued, used to detect mis-issuance.' },
  'certificate-expiration': { term: 'Certificate Expiration', definition: 'The date a TLS certificate stops being valid. Browsers reject connections to expired certificates.' },
  'acme': { term: 'ACME Protocol', definition: 'The automated certificate issuance/renewal protocol used by Let\'s Encrypt and similar CAs, typically producing short-lived (~90-day) certificates.' },
  'hsts': { term: 'HSTS (HTTP Strict Transport Security)', definition: 'A header/preload mechanism that forces browsers to only ever connect to a site over HTTPS, blocking downgrade attacks.' },
  'mixed-content': { term: 'Mixed Content', definition: 'When an HTTPS page loads resources over plain HTTP, weakening the security guarantees of the encrypted connection.' },
  'tls': { term: 'TLS/SSL', definition: 'The cryptographic protocol that encrypts traffic between a browser and a server (the "S" in HTTPS).' },
  'mx': { term: 'MX Record', definition: 'The DNS record type that tells other mail servers where to deliver email for a domain, in priority order.' },
  'spf': { term: 'SPF (Sender Policy Framework)', definition: 'A DNS TXT record listing which mail servers are allowed to send email on behalf of a domain.' },
  'dmarc': { term: 'DMARC', definition: 'A policy record telling receiving mail servers what to do (none/quarantine/reject) when SPF/DKIM checks fail for a domain.' },
  'bimi': { term: 'BIMI (Brand Indicators for Message Identification)', definition: 'A standard letting authenticated senders display their verified logo in supporting inboxes.' },
  'lcp': { term: 'Largest Contentful Paint (LCP)', definition: 'A Core Web Vital measuring how long the largest visible element takes to render.' },
  'cls': { term: 'Cumulative Layout Shift (CLS)', definition: 'A Core Web Vital measuring how much visible content unexpectedly shifts position during load.' },
  'inp': { term: 'Interaction to Next Paint (INP)', definition: 'A Core Web Vital measuring how responsive a page feels to real user clicks/taps/keypresses.' },
  'core-web-vitals': { term: 'Core Web Vitals', definition: 'Google\'s standardized set of real-user-experience metrics (LCP, CLS, INP) used to gauge page quality.' },
  'cdn': { term: 'CDN (Content Delivery Network)', definition: 'A distributed network of edge servers that caches and serves content closer to visitors for speed and resilience.' },
  'cms-fingerprint': { term: 'CMS/Platform Fingerprint', definition: 'Recognizable path or asset-hosting patterns (e.g. /wp-content/) that reveal which content-management platform a site runs on.' },
  'rdap': { term: 'RDAP', definition: 'Registration Data Access Protocol — the modern, structured JSON successor to WHOIS for domain/IP registration lookups.' },
  'wayback-cdx': { term: 'Wayback CDX Index', definition: 'The Internet Archive\'s queryable index of every snapshot it has captured for a URL, including timestamp and content-hash metadata.' },
};

export function glossaryLookup(key: string): GlossaryEntry | undefined {
  return GLOSSARY[key];
}
